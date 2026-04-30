import type { PrismaClient } from "../../generated/prisma/client";
import type { Prisma } from "../../generated/prisma/client";
import { BaseRepository } from "../../shared/repositories/base.repository";
import prisma from "../../config/prisma";

export class MenuItemRepository extends BaseRepository<PrismaClient["menuItem"]> {
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
}

export const menuItemRepository = new MenuItemRepository();
