import type { PrismaClient } from "../../generated/prisma/client";
import { BaseRepository } from "../../shared/repositories/base.repository";
import prisma from "../../config/prisma";

export class MenuRepository extends BaseRepository<PrismaClient["menu"]> {
  constructor() {
    super(prisma.menu);
  }

  /**
   * Convenience method — find by primary key id.
   * Entity-specific query methods should be added here as the application grows.
   */
  async findById(id: string) {
    return this.findUnique({ where: { id } });
  }

  /** Menus belonging to a restaurant, oldest first. */
  async findByRestaurantId(restaurantId: string) {
    return prisma.menu.findMany({
      where: { restaurantId },
      orderBy: { createdAt: "asc" },
    });
  }

  /** Menu with its items eagerly loaded. */
  async findByIdWithItems(id: string) {
    return prisma.menu.findUnique({
      where: { id },
      include: { menuItems: { orderBy: { createdAt: "asc" } } },
    });
  }
}

export const menuRepository = new MenuRepository();
