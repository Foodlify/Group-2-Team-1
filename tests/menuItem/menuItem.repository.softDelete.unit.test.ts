/**
 * MenuItem Repository — soft-delete filtering at the query level.
 *
 * These target the two places where forgetting `isDeleted` is not a cosmetic
 * bug: `reserveStock`, where it would let checkout sell an item that was pulled
 * from the menu, and `releaseStock`, where adding the filter would silently
 * swallow returned units. The stock methods take the transaction client as an
 * argument, so a plain stub is enough — no Prisma needed.
 */
import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "../../src/generated/prisma/client";
import { menuItemRepository } from "../../src/modules/menuItem/menuItem.repository";

const txWith = (count: number) => {
  const updateMany = vi.fn().mockResolvedValue({ count });
  return {
    tx: { menuItem: { updateMany } } as unknown as Prisma.TransactionClient,
    updateMany,
  };
};

describe("reserveStock", () => {
  it("refuses to reserve a soft-deleted item", async () => {
    const { tx, updateMany } = txWith(1);

    await menuItemRepository.reserveStock("item_1", 2, tx);

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "item_1", stock: { gte: 2 }, isDeleted: false },
      data: { stock: { decrement: 2 } },
    });
  });

  it("reports failure when the conditional UPDATE matches no row", async () => {
    const { tx } = txWith(0);

    await expect(
      menuItemRepository.reserveStock("item_1", 2, tx),
    ).resolves.toBe(false);
  });

  it("reports success when exactly one row was decremented", async () => {
    const { tx } = txWith(1);

    await expect(
      menuItemRepository.reserveStock("item_1", 2, tx),
    ).resolves.toBe(true);
  });
});

describe("releaseStock", () => {
  it("returns units even for a deleted item — cancelling must stay honest", async () => {
    const { tx, updateMany } = txWith(1);

    await menuItemRepository.releaseStock("item_1", 3, tx);

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "item_1", stock: { not: null } },
      data: { stock: { increment: 3 } },
    });
    // The absence of `isDeleted` here is the assertion: an item deleted after
    // the order was placed must still get its reserved units back.
    const [args] = updateMany.mock.calls[0] as [{ where: object }];
    expect(args.where).not.toHaveProperty("isDeleted");
  });
});
