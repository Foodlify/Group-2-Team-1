import type { PrismaClient } from "../../generated/prisma/client";
import type { Prisma } from "../../generated/prisma/client";
import { BaseRepository } from "../../shared/repositories/base.repository";
import prisma from "../../config/prisma";

export class CartItemRepository extends BaseRepository<
  PrismaClient["cartItem"]
> {
  constructor() {
    super(prisma.cartItem);
  }

  async findById(id: string) {
    return this.findUnique({ where: { id } });
  }

  async findByIdWithCart(id: string) {
    return prisma.cartItem.findUnique({
      where: { id },
      include: { cart: true },
    });
  }

  async findByCartAndMenuItem(
    cartId: string,
    menuItemId: string,
    tx?: Prisma.TransactionClient,
  ) {
    return (tx ?? prisma).cartItem.findUnique({
      where: {
        cartId_menuItemId: { cartId, menuItemId },
      },
    });
  }

  async updateWithTx(
    args: Parameters<PrismaClient["cartItem"]["update"]>[0],
    tx?: Prisma.TransactionClient,
  ) {
    return (tx ?? prisma).cartItem.update(args);
  }

  async createWithTx(
    args: Parameters<PrismaClient["cartItem"]["create"]>[0],
    tx?: Prisma.TransactionClient,
  ) {
    return (tx ?? prisma).cartItem.create(args);
  }
}

export const cartItemRepository = new CartItemRepository();
