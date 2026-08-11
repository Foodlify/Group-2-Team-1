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

  newGuestToken(): string {
    return crypto.randomBytes(24).toString("base64url");
  }

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

  async clearCart(
    owner: CartOwner,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await cartRepository.deleteByOwner(owner, tx);
    await this.invalidate(owner);
  }

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

      await cartRepository.deleteByOwner({ guestToken }, tx);
    });

    await this.invalidate({ guestToken });
    await this.invalidate({ customerId });
    return this.getMyCart({ customerId });
  }

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

  async lockByOwnerWithItems(owner: CartOwner, tx: Prisma.TransactionClient) {
    return cartRepository.lockByOwnerWithItems(owner, tx);
  }

  private cacheKey(owner: CartOwner): string {
    return isGuestOwner(owner)
      ? cacheKeys.cartOfGuest(owner.guestToken)
      : cacheKeys.cartOfCustomer(owner.customerId);
  }

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

  private toCartResponse(cart: CartWithItems): CartResponse {
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
