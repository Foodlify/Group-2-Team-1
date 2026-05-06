import type { PrismaClient } from "../../generated/prisma/client";
import { BaseRepository } from "../../shared/repositories/base.repository";
import prisma from "../../config/prisma";

export class CartRepository extends BaseRepository<PrismaClient["cart"]> {
  constructor() {
    super(prisma.cart);
  }

  async findById(id: string) {
    return this.findUnique({ where: { id } });
  }

  /**
   * Finds a cart by the owning user's ID, eagerly loading items and their menuItem.
   * Uses prisma delegate directly so TypeScript narrows the return type to include the relations.
   */
  async findByUserIdWithItems(userId: string) {
    console.log("Finding cart for userId:", userId);
    return prisma.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: { menuItem: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
  }
}

export const cartRepository = new CartRepository();
