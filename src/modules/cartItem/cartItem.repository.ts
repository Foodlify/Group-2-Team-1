import type { PrismaClient } from "../../generated/prisma/client";
import { BaseRepository } from "../../shared/repositories/base.repository";
import prisma from "../../config/prisma";

export class CartItemRepository extends BaseRepository<PrismaClient["cartItem"]> {
  constructor() {
    super(prisma.cartItem);
  }

  async findById(id: string) {
    return this.findUnique({ where: { id } });
  }

  /**
   * Fetches a cart item along with its parent cart — used by the service
   * to verify ownership before mutations.
   */
  async findByIdWithCart(id: string) {
    return prisma.cartItem.findUnique({
      where: { id },
      include: { cart: true },
    });
  }

  /**
   * Looks up a cart item by the composite unique key (cartId + menuItemId).
   * Used for the "add item" upsert behavior.
   */
  async findByCartAndMenuItem(cartId: string, menuItemId: string) {
    return prisma.cartItem.findUnique({
      where: {
        cartId_menuItemId: { cartId, menuItemId },
      },
    });
  }

  /**
   * Deletes all items in a given cart. Used by the "clear cart" endpoint.
   */
  async deleteManyByCartId(cartId: string) {
    return prisma.cartItem.deleteMany({ where: { cartId } });
  }
}

export const cartItemRepository = new CartItemRepository();