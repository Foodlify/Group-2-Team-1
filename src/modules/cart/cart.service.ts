import crypto from "crypto";
import { StatusCodes } from "http-status-codes";
import env from "../../config/env";
import logger from "../../config/logger";
import { AppError } from "../../middlewares/error.middleware";
import { cache, cacheKeys } from "../../shared/cache/cache";
import { cartErrors } from "../../shared/exceptions/cart.errors";
import { cartItemRepository } from "../cartItem/cartItem.repository";
import { menuItemService } from "../menuItem/menuItem.service";
import { cartRepository } from "./cart.repository";
import type { CartOwner, CartWithItems } from "./cart.model";
import { isGuestOwner } from "./cart.model";
import type {
  AddCartItemInput,
  CartResponse,
  UpdateCartItemInput,
} from "./cart.validation";
import { Prisma } from "../../generated/prisma/client";

class CartService {
  // ─── Read ─────────────────────────────────────────────
  /**
   * Cache-aside: the cart is the hottest read in the app and changes only
   * through this service, so every mutation below drops the key and this
   * read refills it. A cache outage just means every call hits PostgreSQL.
   */
  async getMyCart(owner: CartOwner): Promise<CartResponse | null> {
    const key = this.cacheKey(owner);
    const cached = await cache.get<CartResponse>(key);
    if (cached) return cached;

    const cart = await cartRepository.findByOwnerWithItems(owner);
    if (!cart) {
      return null;
    }
    const response = this.toCartResponse(cart);
    await cache.set(key, response);
    return response;
  }

  /** Opaque, unguessable identifier for an anonymous visitor's cart. */
  newGuestToken(): string {
    return crypto.randomBytes(24).toString("base64url");
  }

  // ─── Add Item (upsert behavior) ───────────────────────
  async addItem(
    owner: CartOwner,
    input: AddCartItemInput,
  ): Promise<CartResponse> {
    await cartRepository.transaction(async (tx) => {
      const menuItem = await this.fetchMenuItem(input.menuItemId, tx);
      const cart = await this.resolveCart(
        owner,
        menuItem.menu.restaurantId,
        tx,
      );
      await this.upsertCartItem(cart.id, input, menuItem, tx);
    });
    await this.invalidate(owner);
    const cart = await this.getMyCart(owner);
    if (!cart)
      throw new AppError(
        "Cart not found after update",
        StatusCodes.INTERNAL_SERVER_ERROR,
      );
    return cart;
  }

  // ─── Update Quantity ──────────────────────────────────
  async updateItem(
    owner: CartOwner,
    itemId: string,
    input: UpdateCartItemInput,
  ): Promise<CartResponse> {
    await this.assertItemBelongsToOwner(owner, itemId);

    await cartItemRepository.update({
      where: { id: itemId },
      data: { quantity: input.quantity },
    });

    await this.invalidate(owner);
    const cart = await this.getMyCart(owner);
    if (!cart)
      throw new AppError(
        "Cart not found after update",
        StatusCodes.INTERNAL_SERVER_ERROR,
      );
    return cart;
  }

  // ─── Remove Item ──────────────────────────────────────
  async removeItem(owner: CartOwner, itemId: string): Promise<CartResponse> {
    await this.assertItemBelongsToOwner(owner, itemId);

    await cartItemRepository.delete({ where: { id: itemId } });

    await this.invalidate(owner);
    const cart = await this.getMyCart(owner);
    if (!cart)
      throw new AppError(
        "Cart not found after update",
        StatusCodes.INTERNAL_SERVER_ERROR,
      );
    return cart;
  }

  // ─── Clear Cart ───────────────────────────────────────
  async clearCart(
    owner: CartOwner,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await cartRepository.deleteByOwner(owner, tx);
    await this.invalidate(owner);
  }

  // ─── Merge a guest cart into the customer's cart ──────
  /**
   * Called right after login with the guest's `X-Cart-Token`.
   * - customer has no cart → the guest row is handed over as-is (items keep
   *   their snapshot prices, nothing is copied);
   * - same restaurant → quantities are summed per menu item;
   * - different restaurant → 400, exactly like adding an item from another
   *   restaurant. The client clears one side and retries.
   *
   * Everything runs in one transaction under the same row locks the add-item
   * flow takes, so a concurrent add can't be lost mid-merge. A missing or
   * already-merged token is a no-op — merge is safe to retry.
   */
  async mergeGuestCart(
    customerId: string,
    guestToken: string,
  ): Promise<CartResponse | null> {
    await cartRepository.transaction(async (tx) => {
      const guestCart = await cartRepository.lockByOwnerWithItems(
        { guestToken },
        tx,
      );
      if (!guestCart) return;

      const hasCustomerCart = await cartRepository.lockByOwner(
        { customerId },
        tx,
      );
      if (!hasCustomerCart) {
        await cartRepository.assignToCustomer(guestCart.id, customerId, tx);
        return;
      }

      const customerCart = await cartRepository.findByOwner({ customerId }, tx);
      if (!customerCart) return;
      if (customerCart.restaurantId !== guestCart.restaurantId) {
        throw new AppError(
          cartErrors.MERGE_DIFFERENT_RESTAURANT.message,
          cartErrors.MERGE_DIFFERENT_RESTAURANT.statusCode,
        );
      }

      for (const item of guestCart.cartItems) {
        await this.upsertCartItem(
          customerCart.id,
          { menuItemId: item.menuItemId, quantity: item.quantity },
          { name: item.name, price: item.price },
          tx,
        );
      }
      // The guest row (and its items, by cascade) is gone once merged.
      await cartRepository.deleteByOwner({ guestToken }, tx);
    });

    // Both identities changed: the guest cart is gone, the customer's grew.
    await this.invalidate({ guestToken });
    await this.invalidate({ customerId });
    return this.getMyCart({ customerId });
  }

  // ─── Housekeeping ─────────────────────────────────────
  /**
   * Deletes carts nobody has touched in a while: guest carts after
   * `CART_GUEST_TTL_HOURS` (they're disposable — the visitor is gone and the
   * token with them) and customer carts after `CART_CUSTOMER_TTL_DAYS` (saved
   * state, so a far longer grace period). Returns how many were removed.
   *
   * Run periodically by the sweeper job and on demand by admins.
   */
  async sweepAbandoned(): Promise<{ deleted: number }> {
    const now = Date.now();
    const deleted = await cartRepository.deleteAbandoned({
      guestBefore: new Date(now - env.CART_GUEST_TTL_HOURS * 60 * 60 * 1000),
      customerBefore: new Date(
        now - env.CART_CUSTOMER_TTL_DAYS * 24 * 60 * 60 * 1000,
      ),
    });
    if (deleted > 0) {
      logger.info("Abandoned carts swept", {
        deleted,
        guestTtlHours: env.CART_GUEST_TTL_HOURS,
        customerTtlDays: env.CART_CUSTOMER_TTL_DAYS,
      });
    }
    return { deleted };
  }

  /**
   * Acquires a row-level lock on the cart and returns it with items.
   * Must be called inside a Prisma transaction — the lock is released
   * when the transaction commits or rolls back.
   * Used by checkout flow to prevent concurrent cart mutations.
   */
  async lockByOwnerWithItems(owner: CartOwner, tx: Prisma.TransactionClient) {
    return cartRepository.lockByOwnerWithItems(owner, tx);
  }

  // ─── Private Helpers ──────────────────────────────────

  private cacheKey(owner: CartOwner): string {
    return isGuestOwner(owner)
      ? cacheKeys.cartOfGuest(owner.guestToken)
      : cacheKeys.cartOfCustomer(owner.customerId);
  }

  /**
   * Drops the cached cart. Called before the post-mutation re-read, which
   * repopulates it — invalidate-then-refill rather than patching the cached
   * value, so the cache can never drift from the database.
   */
  private async invalidate(owner: CartOwner): Promise<void> {
    await cache.del(this.cacheKey(owner));
  }

  private async fetchMenuItem(
    menuItemId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const menuItem = await menuItemService.findByIdWithMenu(menuItemId, tx);
    if (!menuItem)
      throw new AppError(
        cartErrors.MENU_ITEM_NOT_FOUND.message,
        cartErrors.MENU_ITEM_NOT_FOUND.statusCode,
      );
    return menuItem;
  }

  private async resolveCart(
    owner: CartOwner,
    restaurantId: string,
    tx: Prisma.TransactionClient,
  ) {
    // Lock the cart row up-front (no-op UPDATE) so a concurrent checkout can't
    // read-and-clear the cart while we add an item — which would otherwise drop
    // the just-added item via clearCart's cascade. The lock is held until this
    // transaction commits. A `false` result means there's no cart yet (or it was
    // checked out while we waited on the lock) — fall through and create a fresh
    // one; the read below runs under the held lock so it can't race a checkout.
    const cartExists = await cartRepository.lockByOwner(owner, tx);
    if (cartExists) {
      const existingCart = await cartRepository.findByOwner(owner, tx);
      if (existingCart) {
        if (existingCart.restaurantId !== restaurantId) {
          throw new AppError(
            cartErrors.DIFFERENT_RESTAURANT.message,
            cartErrors.DIFFERENT_RESTAURANT.statusCode,
          );
        }
        return existingCart;
      }
    }
    return cartRepository.createCart({ ...owner, restaurantId }, tx);
  }

  private async upsertCartItem(
    cartId: string,
    input: AddCartItemInput,
    menuItem: { name: string; price: Prisma.Decimal | number },
    tx?: Prisma.TransactionClient,
  ) {
    const existing = await cartItemRepository.findByCartAndMenuItem(
      cartId,
      input.menuItemId,
      tx,
    );
    if (existing) {
      await cartItemRepository.updateWithTx(
        {
          where: { id: existing.id },
          data: { quantity: existing.quantity + input.quantity },
        },
        tx,
      );
    } else {
      await cartItemRepository.createWithTx(
        {
          data: {
            cartId,
            menuItemId: input.menuItemId,
            quantity: input.quantity,
            name: menuItem.name,
            price: menuItem.price,
          },
        },
        tx,
      );
    }
  }

  /**
   * Ensures a cart item exists AND belongs to the given owner.
   * Throws 404 if not found, 403 if it belongs to someone else.
   */
  private async assertItemBelongsToOwner(
    owner: CartOwner,
    itemId: string,
  ): Promise<void> {
    const item = await cartItemRepository.findByIdWithCart(itemId);

    if (!item) {
      throw new AppError(
        cartErrors.CART_ITEM_NOT_FOUND.message,
        cartErrors.CART_ITEM_NOT_FOUND.statusCode,
      );
    }
    const ownsIt = isGuestOwner(owner)
      ? item.cart.guestToken === owner.guestToken
      : item.cart.customerId === owner.customerId;
    if (!ownsIt) {
      throw new AppError(
        cartErrors.CART_ITEM_FORBIDDEN.message,
        cartErrors.CART_ITEM_FORBIDDEN.statusCode,
      );
    }
  }

  /**
   * Maps a cart-with-items DB record to the API response shape,
   * computing derived fields (totalPrice, itemCount).
   */
  private toCartResponse(cart: CartWithItems): CartResponse {
    // Accumulate in Decimal to avoid binary-float rounding drift, converting to
    // Number only at the response boundary (totalPrice is a JSON number).
    const totalPrice = cart.cartItems
      .reduce(
        (sum, item) =>
          sum.plus(new Prisma.Decimal(item.price).times(item.quantity)),
        new Prisma.Decimal(0),
      )
      .toNumber();
    const itemCount = cart.cartItems.reduce(
      (count, item) => count + item.quantity,
      0,
    );

    return {
      id: cart.id,
      customerId: cart.customerId,
      restaurantId: cart.restaurantId,
      items: cart.cartItems.map((item) => ({
        id: item.id,
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        menuItem: {
          id: item.menuItemId,
          name: item.name,
          price: Number(item.price),
        },
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
      totalPrice,
      itemCount,
      createdAt: cart.createdAt.toISOString(),
      updatedAt: cart.updatedAt.toISOString(),
    };
  }
}

export const cartService = new CartService();
