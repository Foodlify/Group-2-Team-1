import type { PrismaClient } from "../../generated/prisma/client";
import type { Prisma } from "../../generated/prisma/client";
import { BaseRepository } from "../../shared/repositories/base.repository";
import prisma from "../../config/prisma";

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
    return this.findUnique({ where: { id } });
  }

  async findByIdWithMenu(id: string, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).menuItem.findUnique({
      where: { id },
      include: { menu: { select: { restaurantId: true } } },
    });
  }

  async findManyByIds(ids: string[]) {
    return prisma.menuItem.findMany({
      where: { id: { in: ids } },
    });
  }

  /** All items belonging to a menu, oldest first. */
  async findByMenuId(menuId: string) {
    return prisma.menuItem.findMany({
      where: { menuId },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Paginated case-insensitive name search across the whole catalog, with the
   * owning menu + restaurant joined in so each hit is actionable on its own.
   */
  async searchPaginated(page: number, limit: number, search?: string) {
    const where: Prisma.MenuItemWhereInput = search
      ? { name: { contains: search, mode: "insensitive" } }
      : {};
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
