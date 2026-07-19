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

  async createMenu(data: any) {
    return this.create({
      data,
    });
  }
}

export const menuRepository = new MenuRepository();
