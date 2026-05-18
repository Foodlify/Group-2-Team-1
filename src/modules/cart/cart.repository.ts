import type { PrismaClient, Prisma } from "../../generated/prisma/client";
import { BaseRepository } from "../../shared/repositories/base.repository";
import prisma from "../../config/prisma";

export class CartRepository extends BaseRepository<PrismaClient["cart"]> {
  constructor() {
    super(prisma.cart);
  }

  async findById(id: string) {
    return this.findUnique({ where: { id } });
  }

  async findByCustomerId(customerId: string, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).cart.findUnique({ where: { customerId } });
  }

  async createCart(
    data: { customerId: string; restaurantId: string },
    tx?: Prisma.TransactionClient,
  ) {
    return (tx ?? prisma).cart.create({ data });
  }

  /**
   * Finds a cart by the owning user's ID, eagerly loading its items.
   * Uses prisma delegate directly so TypeScript narrows the return type to include the relation.
   */
  async findByCustomerIdWithItems(customerId: string) {
    return prisma.cart.findUnique({
      where: { customerId },
      include: {
        cartItems: {
          orderBy: { createdAt: "asc" },
        },
      },
    });
  }

  /**
   * Acquires a row-level lock on the cart and returns it with items.
   * Uses a no-op UPDATE to force Postgres row locking — the lock is held
   * until the surrounding transaction commits or rolls back, preventing
   * concurrent modifications of the cart during checkout.
   * Must be called inside a Prisma transaction.
   */
  async lockByCustomerIdWithItems(
    customerId: string,
    tx: Prisma.TransactionClient,
  ) {
    await tx.cart.update({
      where: { customerId },
      data: { updatedAt: new Date() },
    });
    return tx.cart.findUnique({
      where: { customerId },
      include: {
        cartItems: {
          orderBy: { createdAt: "asc" },
        },
      },
    });
  }

  /**
   * Deletes a customer's cart. Cascades to cartItems via the schema relation.
   * Uses deleteMany for idempotency (no-throw if cart is already gone).
   */
  async deleteByCustomerId(
    customerId: string,
    tx?: Prisma.TransactionClient,
  ) {
    return (tx ?? prisma).cart.deleteMany({ where: { customerId } });
  }
}

export const cartRepository = new CartRepository();
