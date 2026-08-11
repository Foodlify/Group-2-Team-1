import type { PrismaClient, Prisma } from "../../generated/prisma/client";
import { BaseRepository } from "../../shared/repositories/base.repository";
import prisma from "../../config/prisma";
import type { CartOwner } from "./cart.model";

export class CartRepository extends BaseRepository<PrismaClient["cart"]> {
  constructor() {
    super(prisma.cart);
  }

  async findById(id: string) {
    return this.findUnique({ where: { id } });
  }

  async findByOwner(owner: CartOwner, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).cart.findUnique({ where: owner });
  }

  async createCart(
    data: CartOwner & { restaurantId: string },
    tx?: Prisma.TransactionClient,
  ) {
    return (tx ?? prisma).cart.create({ data });
  }

  async findByOwnerWithItems(owner: CartOwner) {
    return prisma.cart.findUnique({
      where: owner,
      include: {
        cartItems: {
          orderBy: { createdAt: "asc" },
        },
      },
    });
  }

  async lockByOwnerWithItems(owner: CartOwner, tx: Prisma.TransactionClient) {
    const { count } = await tx.cart.updateMany({
      where: owner,
      data: { updatedAt: new Date() },
    });
    if (count === 0) return null;
    return tx.cart.findUnique({
      where: owner,
      include: {
        cartItems: {
          orderBy: { createdAt: "asc" },
        },
      },
    });
  }

  async lockByOwner(
    owner: CartOwner,
    tx: Prisma.TransactionClient,
  ): Promise<boolean> {
    const { count } = await tx.cart.updateMany({
      where: owner,
      data: { updatedAt: new Date() },
    });
    return count > 0;
  }

  async deleteByOwner(owner: CartOwner, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).cart.deleteMany({ where: owner });
  }

  async deleteAbandoned(cutoffs: {
    guestBefore: Date;
    customerBefore: Date;
  }): Promise<number> {
    const { count } = await prisma.cart.deleteMany({
      where: {
        OR: [
          { guestToken: { not: null }, updatedAt: { lt: cutoffs.guestBefore } },
          {
            customerId: { not: null },
            updatedAt: { lt: cutoffs.customerBefore },
          },
        ],
      },
    });
    return count;
  }

  async assignToCustomer(
    cartId: string,
    customerId: string,
    tx?: Prisma.TransactionClient,
  ) {
    return (tx ?? prisma).cart.update({
      where: { id: cartId },
      data: { customerId, guestToken: null },
    });
  }
}

export const cartRepository = new CartRepository();
