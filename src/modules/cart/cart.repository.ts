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
   * Uses a no-op UPDATE to force Postgres row locking — held until the
   * surrounding transaction commits or rolls back. Item additions take the
   * same lock via `lockByCustomerId`, so this serializes checkout against
   * concurrent adds (and other checkouts) for the same cart, preventing a
   * just-added item from being dropped by clearCart. Quantity updates and
   * removals are not lock-protected (their concurrent loss is benign).
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
   * Acquires a row-level lock on the customer's cart via a no-op UPDATE,
   * held until the surrounding transaction commits or rolls back. Uses
   * updateMany so a missing cart yields `false` instead of throwing P2025 —
   * letting the add-item flow lock-or-detect in one round-trip without a
   * separate existence check racing the lock. Returns whether an existing
   * cart was locked. Must be called inside a Prisma transaction.
   */
  async lockByCustomerId(
    customerId: string,
    tx: Prisma.TransactionClient,
  ): Promise<boolean> {
    const { count } = await tx.cart.updateMany({
      where: { customerId },
      data: { updatedAt: new Date() },
    });
    return count > 0;
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
