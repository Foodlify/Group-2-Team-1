import type { PrismaClient } from "../../generated/prisma/client";
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
    console.log("menu item id", id);

    return this.findUnique({ where: { id } });
  }
}

export const menuItemRepository = new MenuItemRepository();
