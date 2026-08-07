import type { PrismaClient } from "../../generated/prisma/client";
import type { Prisma } from "../../generated/prisma/client";
import { BaseRepository } from "../../shared/repositories/base.repository";
import prisma from "../../config/prisma";

/**
 * Every read here filters out soft-deleted rows. `findUnique` can't express
 * that (its `where` only takes unique fields), which is why the lookups below
 * use `findFirst` — dropping back to `findUnique` would silently resurrect
 * deleted items.
 */
const notDeleted = { isDeleted: false } as const;

export class MenuItemRepository extends BaseRepository<
  PrismaClient["menuItem"]
> {
  constructor() {
    super(prisma.menuItem);
  }

  /**
   * Convenience method — find by primary key id.
   * Entity-specific query methods should be added here as the application grows.
   */
  async findById(id: string) {
    return prisma.menuItem.findFirst({ where: { id, ...notDeleted } });
  }

  /** Restore is the only caller that legitimately wants a deleted row. */
  async findByIdIncludingDeleted(id: string) {
    return this.findUnique({ where: { id } });
  }

  async findByIdWithMenu(id: string, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).menuItem.findFirst({
      where: { id, ...notDeleted },
      include: { menu: { select: { restaurantId: true } } },
    });
  }

  async findManyByIds(ids: string[]) {
    return prisma.menuItem.findMany({
      where: { id: { in: ids }, ...notDeleted },
    });
  }

  /**
   * Reserves `quantity` units in a single conditional UPDATE:
   * `WHERE id = ? AND stock >= quantity`. Postgres takes the row lock for the
   * duration, so two concurrent checkouts can never both pass the check —
   * the loser matches zero rows and gets `false`. This is what prevents
   * overselling; a read-then-write check could not.
   *
   * Untracked items (stock IS NULL) never match the filter, so callers must
   * skip them rather than treat `false` as "out of stock".
   *
   * `isDeleted` is part of the filter: an item removed from the menu after it
   * landed in someone's cart must not be sellable at checkout.
   */
  async reserveStock(
    menuItemId: string,
    quantity: number,
    tx: Prisma.TransactionClient,
  ): Promise<boolean> {
    const { count } = await tx.menuItem.updateMany({
      where: { id: menuItemId, stock: { gte: quantity }, ...notDeleted },
      data: { stock: { decrement: quantity } },
    });
    return count > 0;
  }

  /**
   * Puts reserved units back (order cancelled). No-op for untracked items.
   *
   * Deliberately does NOT filter on `isDeleted`: if the item was removed from
   * the menu between the order and its cancellation, those units still have to
   * go back so the count stays honest for a later restore.
   */
  async releaseStock(
    menuItemId: string,
    quantity: number,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await tx.menuItem.updateMany({
      where: { id: menuItemId, stock: { not: null } },
      data: { stock: { increment: quantity } },
    });
  }

  /** All items belonging to a menu, oldest first. */
  async findByMenuId(menuId: string, includeDeleted = false) {
    return prisma.menuItem.findMany({
      where: { menuId, ...(includeDeleted ? {} : notDeleted) },
      orderBy: { createdAt: "asc" },
    });
  }

  // ─── Soft delete ──────────────────────────────────────
  /** Flags one item as deleted, recording who did it. */
  async softDeleteById(
    id: string,
    actorId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await (tx ?? prisma).menuItem.update({
      where: { id },
      data: { isDeleted: true, updatedBy: actorId },
    });
  }

  /**
   * Cascade step — flags every live item of the given menus. Runs inside the
   * caller's transaction so a menu/restaurant delete is all-or-nothing.
   */
  async softDeleteByMenuIds(
    menuIds: string[],
    actorId: string,
    tx: Prisma.TransactionClient,
  ): Promise<number> {
    const { count } = await tx.menuItem.updateMany({
      where: { menuId: { in: menuIds }, ...notDeleted },
      data: { isDeleted: true, updatedBy: actorId },
    });
    return count;
  }

  async restoreById(
    id: string,
    actorId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await (tx ?? prisma).menuItem.update({
      where: { id },
      data: { isDeleted: false, updatedBy: actorId },
    });
  }

  /** Cascade step for restoring a menu or a whole restaurant. */
  async restoreByMenuIds(
    menuIds: string[],
    actorId: string,
    tx: Prisma.TransactionClient,
  ): Promise<number> {
    const { count } = await tx.menuItem.updateMany({
      where: { menuId: { in: menuIds }, isDeleted: true },
      data: { isDeleted: false, updatedBy: actorId },
    });
    return count;
  }

  /**
   * Paginated case-insensitive name search across the whole catalog, with the
   * owning menu + restaurant joined in so each hit is actionable on its own.
   */
  async searchPaginated(page: number, limit: number, search?: string) {
    // Filtering on the item's own flag is enough because deleting a menu or a
    // restaurant cascades the flag down — see `menuService.remove`.
    const where: Prisma.MenuItemWhereInput = search
      ? { name: { contains: search, mode: "insensitive" }, ...notDeleted }
      : { ...notDeleted };
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      prisma.menuItem.findMany({
        where,
        include: {
          menu: {
            select: {
              id: true,
              name: true,
              restaurant: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { name: "asc" },
        skip,
        take: limit,
      }),
      prisma.menuItem.count({ where }),
    ]);
    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
}

export const menuItemRepository = new MenuItemRepository();
