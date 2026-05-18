import { StatusCodes } from "http-status-codes";
import { AppError } from "../../middlewares/error.middleware";
import { cartErrors } from "../../shared/exceptions/cart.errors";
import { cartItemRepository } from "../cartItem/cartItem.repository";
import { customerRepository } from "../customer/customer.repository";
import { menuItemRepository } from "../menuItem/menuItem.repository";
import { cartRepository } from "./cart.repository";
import type { CartWithItems } from "./cart.model";
import type {
  AddCartItemInput,
  CartResponse,
  UpdateCartItemInput,
} from "./cart.validation";
import type { Prisma } from "../../generated/prisma/client";

class CartService {
  // ─── Read ─────────────────────────────────────────────
  async getMyCart(customerId: string): Promise<CartResponse | null> {
    await this.assertCustomerExists(customerId);

    const cart = await cartRepository.findByCustomerIdWithItems(customerId);
    if (!cart) {
      return null;
    }
    return this.toCartResponse(cart);
  }

  // ─── Add Item (upsert behavior) ───────────────────────
  async addItem(
    customerId: string,
    input: AddCartItemInput,
  ): Promise<CartResponse> {
    await this.assertCustomerExists(customerId);

    await cartRepository.transaction(async (tx) => {
      const menuItem = await this.fetchMenuItem(input.menuItemId, tx);
      const cart = await this.resolveCart(customerId, menuItem.menu.restaurantId, tx);
      await this.upsertCartItem(cart.id, input, menuItem, tx);
    });
    const cart = await this.getMyCart(customerId);
    if (!cart) throw new AppError("Cart not found after update", StatusCodes.INTERNAL_SERVER_ERROR);
    return cart;
  }

  // ─── Update Quantity ──────────────────────────────────
  async updateItem(
    customerId: string,
    itemId: string,
    input: UpdateCartItemInput,
  ): Promise<CartResponse> {
    await this.assertCustomerExists(customerId);
    await this.assertItemBelongsToUser(customerId, itemId);

    await cartItemRepository.update({
      where: { id: itemId },
      data: { quantity: input.quantity },
    });

    const cart = await this.getMyCart(customerId);
    if (!cart) throw new AppError("Cart not found after update", StatusCodes.INTERNAL_SERVER_ERROR);
    return cart;
  }

  // ─── Remove Item ──────────────────────────────────────
  async removeItem(customerId: string, itemId: string): Promise<CartResponse> {
    await this.assertCustomerExists(customerId);
    await this.assertItemBelongsToUser(customerId, itemId);

    await cartItemRepository.delete({ where: { id: itemId } });

    const cart = await this.getMyCart(customerId);
    if (!cart) throw new AppError("Cart not found after update", StatusCodes.INTERNAL_SERVER_ERROR);
    return cart;
  }

  // ─── Clear Cart ───────────────────────────────────────
  async clearCart(customerId: string): Promise<void> {
    await this.assertCustomerExists(customerId);

    const cart = await cartRepository.findUnique({ where: { customerId } });
    if (!cart) return; // Nothing to clear

    await cartItemRepository.deleteManyByCartId(cart.id);
  }

  // ─── Private Helpers ──────────────────────────────────

  private async assertCustomerExists(customerId: string): Promise<void> {
    const customer = await customerRepository.findById(customerId);
    if (!customer) {
      throw new AppError(
        cartErrors.CUSTOMER_NOT_FOUND.message,
        cartErrors.CUSTOMER_NOT_FOUND.statusCode,
      );
    }
  }

  private async fetchMenuItem(menuItemId: string, tx?: Prisma.TransactionClient) {
    const menuItem = await menuItemRepository.findByIdWithMenu(menuItemId, tx);
    if (!menuItem)
      throw new AppError(
        cartErrors.MENU_ITEM_NOT_FOUND.message,
        cartErrors.MENU_ITEM_NOT_FOUND.statusCode,
      );
    return menuItem;
  }

  private async resolveCart(
    customerId: string,
    restaurantId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const existingCart = await cartRepository.findByCustomerId(customerId, tx);
    if (existingCart && existingCart.restaurantId !== restaurantId) {
      throw new AppError(
        cartErrors.DIFFERENT_RESTAURANT.message,
        cartErrors.DIFFERENT_RESTAURANT.statusCode,
      );
    }
    return existingCart ?? (await cartRepository.createCart({ customerId, restaurantId }, tx));
  }

  private async upsertCartItem(
    cartId: string,
    input: AddCartItemInput,
    menuItem: NonNullable<
      Awaited<ReturnType<typeof menuItemRepository.findByIdWithMenu>>
    >,
    tx?: Prisma.TransactionClient,
  ) {
    const existing = await cartItemRepository.findByCartAndMenuItem(
      cartId,
      input.menuItemId,
      tx,
    );
    if (existing) {
      await cartItemRepository.updateWithTx(
        { where: { id: existing.id }, data: { quantity: existing.quantity + input.quantity } },
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
   * Ensures a cart item exists AND belongs to the given user.
   * Throws 404 if not found, 403 if it belongs to another user.
   */
  private async assertItemBelongsToUser(
    customerId: string,
    itemId: string,
  ): Promise<void> {
    const item = await cartItemRepository.findByIdWithCart(itemId);

    if (!item) {
      throw new AppError(
        cartErrors.CART_ITEM_NOT_FOUND.message,
        cartErrors.CART_ITEM_NOT_FOUND.statusCode,
      );
    }
    if (item.cart.customerId !== customerId) {
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
    const totalPrice = cart.cartItems.reduce(
      (sum, item) => sum + Number(item.price) * item.quantity,
      0,
    );
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
