import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { BaseRepository } from "../../shared/repositories/base.repository";
import prisma from "../../config/prisma";

/** See `menuItem.repository` — same rule: every read hides soft-deleted rows. */
const notDeleted = { isDeleted: false } as const;

export class MenuRepository extends BaseRepository<PrismaClient["menu"]> {
  constructor() {
    super(prisma.menu);
  }

  /**
   * Convenience method — find by primary key id.
   * Entity-specific query methods should be added here as the application grows.
   */
  async findById(id: string) {
    return prisma.menu.findFirst({ where: { id, ...notDeleted } });
  }

  /** Restore is the only caller that legitimately wants a deleted row. */
  async findByIdIncludingDeleted(id: string) {
    return this.findUnique({ where: { id } });
  }

  /** Menus belonging to a restaurant, oldest first. */
  async findByRestaurantId(restaurantId: string, includeDeleted = false) {
    return prisma.menu.findMany({
      where: { restaurantId, ...(includeDeleted ? {} : notDeleted) },
      orderBy: { createdAt: "asc" },
    });
  }

  /** Ids only — the cascade needs them to reach the items in one query. */
  async findIdsByRestaurantId(
    restaurantId: string,
    tx: Prisma.TransactionClient,
  ): Promise<string[]> {
    const menus = await tx.menu.findMany({
      where: { restaurantId },
      select: { id: true },
    });
    return menus.map((m) => m.id);
  }

  /** Menu with its items eagerly loaded — deleted items are left out. */
  async findByIdWithItems(id: string, includeDeleted = false) {
    const where = includeDeleted ? { id } : { id, ...notDeleted };
    return prisma.menu.findFirst({
      where,
      include: {
        menuItems: {
          where: includeDeleted ? {} : notDeleted,
          orderBy: { createdAt: "asc" },
        },
      },
    });
  }

  // ─── Soft delete ──────────────────────────────────────
  async softDeleteById(
    id: string,
    actorId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await (tx ?? prisma).menu.update({
      where: { id },
      data: { isDeleted: true, updatedBy: actorId },
    });
  }

  /** Cascade step — flags every live menu of a restaurant. */
  async softDeleteByRestaurantId(
    restaurantId: string,
    actorId: string,
    tx: Prisma.TransactionClient,
  ): Promise<number> {
    const { count } = await tx.menu.updateMany({
      where: { restaurantId, ...notDeleted },
      data: { isDeleted: true, updatedBy: actorId },
    });
    return count;
  }

  async restoreById(
    id: string,
    actorId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await (tx ?? prisma).menu.update({
      where: { id },
      data: { isDeleted: false, updatedBy: actorId },
    });
  }

  async restoreByRestaurantId(
    restaurantId: string,
    actorId: string,
    tx: Prisma.TransactionClient,
  ): Promise<number> {
    const { count } = await tx.menu.updateMany({
      where: { restaurantId, isDeleted: true },
      data: { isDeleted: false, updatedBy: actorId },
    });
    return count;
  }
}

export const menuRepository = new MenuRepository();
