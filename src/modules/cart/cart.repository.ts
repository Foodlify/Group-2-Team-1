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

  /** `owner` is `{ customerId }` or `{ guestToken }` — both are unique columns. */
  async findByOwner(owner: CartOwner, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).cart.findUnique({ where: owner });
  }

  async createCart(
    data: CartOwner & { restaurantId: string },
    tx?: Prisma.TransactionClient,
  ) {
    return (tx ?? prisma).cart.create({ data });
  }

  /**
   * Finds a cart by its owner, eagerly loading its items.
   * Uses prisma delegate directly so TypeScript narrows the return type to include the relation.
   */
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

  /**
   * Acquires a row-level lock on the cart and returns it with items.
   * Uses a no-op UPDATE to force Postgres row locking — held until the
   * surrounding transaction commits or rolls back. Item additions take the
   * same lock via `lockByOwner`, so this serializes checkout against
   * concurrent adds (and other checkouts) for the same cart, preventing a
   * just-added item from being dropped by clearCart. Quantity updates and
   * removals are not lock-protected (their concurrent loss is benign).
   * Must be called inside a Prisma transaction.
   */
  async lockByOwnerWithItems(owner: CartOwner, tx: Prisma.TransactionClient) {
    // updateMany (not update) so a missing cart yields count === 0 instead of
    // throwing P2025 — letting checkout return a clean 404 CART_NOT_FOUND
    // rather than a 500. Mirrors `lockByOwner`.
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

  /**
   * Acquires a row-level lock on the owner's cart via a no-op UPDATE,
   * held until the surrounding transaction commits or rolls back. Uses
   * updateMany so a missing cart yields `false` instead of throwing P2025 —
   * letting the add-item flow lock-or-detect in one round-trip without a
   * separate existence check racing the lock. Returns whether an existing
   * cart was locked. Must be called inside a Prisma transaction.
   */
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

  /**
   * Deletes an owner's cart. Cascades to cartItems via the schema relation.
   * Uses deleteMany for idempotency (no-throw if cart is already gone).
   */
  async deleteByOwner(owner: CartOwner, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).cart.deleteMany({ where: owner });
  }

  /**
   * Deletes carts untouched since their cutoff — guest and customer carts get
   * different grace periods. Items go with them via the cascade. Returns how
   * many carts were removed.
   */
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

  /**
   * Hands a guest cart over to a customer: the same row keeps its items and
   * just swaps identity. Used when the customer has no cart of their own.
   */
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
