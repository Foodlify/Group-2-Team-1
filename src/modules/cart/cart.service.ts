import { AppError } from "../../middlewares/error.middleware";
import { cartItemRepository } from "../cartItem/cartItem.repository";
import { menuItemRepository } from "../menuItem/menuItem.repository";
import { cartRepository } from "./cart.repository";
import type { CartWithItems } from "./cart.model";
import type {
  AddCartItemInput,
  CartResponse,
  UpdateCartItemInput,
} from "./cart.validation";

class CartService {
  // ─── Read ─────────────────────────────────────────────
  async getMyCart(userId: string): Promise<CartResponse> {
    const cart = await cartRepository.findByUserIdWithItems(userId);
    if (!cart) {
      return {
        id: "",
        userId,
        items: [],
        totalPrice: 0,
        itemCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    return this.toCartResponse(cart);
  }

  // ─── Add Item (upsert behavior) ───────────────────────
  async addItem(
    userId: string,
    input: AddCartItemInput,
  ): Promise<CartResponse> {
    // 1. Ensure menu item exists
    const menuItem = await menuItemRepository.findById(input.menuItemId);
    if (!menuItem) {
      throw new AppError("Menu item not found", 404);
    }

    // 2. Get or create the cart
    const cart =
      (await cartRepository.findUnique({ where: { userId } })) ??
      (await cartRepository.create({ data: { userId } }));

    // 3. Upsert the cart item
    const existing = await cartItemRepository.findByCartAndMenuItem(
      cart.id,
      input.menuItemId,
    );

    if (existing) {
      await cartItemRepository.update({
        where: { id: existing.id },
        data: { quantity: existing.quantity + input.quantity },
      });
    } else {
      await cartItemRepository.create({
        data: {
          cartId: cart.id,
          menuItemId: input.menuItemId,
          quantity: input.quantity,
        },
      });
    }

    return this.getMyCart(userId);
  }

  // ─── Update Quantity ──────────────────────────────────
  async updateItem(
    userId: string,
    itemId: string,
    input: UpdateCartItemInput,
  ): Promise<CartResponse> {
    await this.assertItemBelongsToUser(userId, itemId);

    await cartItemRepository.update({
      where: { id: itemId },
      data: { quantity: input.quantity },
    });

    return this.getMyCart(userId);
  }

  // ─── Remove Item ──────────────────────────────────────
  async removeItem(userId: string, itemId: string): Promise<CartResponse> {
    await this.assertItemBelongsToUser(userId, itemId);

    await cartItemRepository.delete({ where: { id: itemId } });

    return this.getMyCart(userId);
  }

  // ─── Clear Cart ───────────────────────────────────────
  async clearCart(userId: string): Promise<void> {
    const cart = await cartRepository.findUnique({ where: { userId } });
    if (!cart) return; // Nothing to clear

    await cartItemRepository.deleteManyByCartId(cart.id);
  }

  // ─── Private Helpers ──────────────────────────────────

  /**
   * Ensures a cart item exists AND belongs to the given user.
   * Throws 404 if not found, 403 if it belongs to another user.
   */
  private async assertItemBelongsToUser(
    userId: string,
    itemId: string,
  ): Promise<void> {
    const item = await cartItemRepository.findByIdWithCart(itemId);

    if (!item) {
      throw new AppError("Cart item not found", 404);
    }
    if (item.cart.userId !== userId) {
      throw new AppError("This cart item does not belong to you", 403);
    }
  }

  /**
   * Maps a cart-with-items DB record to the API response shape,
   * computing derived fields (totalPrice, itemCount).
   */
  private toCartResponse(cart: CartWithItems): CartResponse {
    const totalPrice = cart.items.reduce(
      (sum, item) => sum + item.menuItem.price * item.quantity,
      0,
    );
    const itemCount = cart.items.reduce(
      (count, item) => count + item.quantity,
      0,
    );

    return {
      id: cart.id,
      userId: cart.userId,
      items: cart.items.map((item) => ({
        id: item.id,
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        menuItem: {
          id: item.menuItem.id,
          name: item.menuItem.name,
          price: item.menuItem.price,
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
