import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { BaseRepository } from "../../shared/repositories/base.repository";
import prisma from "../../config/prisma";

const notDeleted = { isDeleted: false } as const;

export class MenuRepository extends BaseRepository<PrismaClient["menu"]> {
  constructor() {
    super(prisma.menu);
  }

  async findById(id: string) {
    return prisma.menu.findFirst({ where: { id, ...notDeleted } });
  }

  async findByIdIncludingDeleted(id: string) {
    return this.findUnique({ where: { id } });
  }

  async findByRestaurantId(restaurantId: string, includeDeleted = false) {
    return prisma.menu.findMany({
      where: { restaurantId, ...(includeDeleted ? {} : notDeleted) },
      orderBy: { createdAt: "asc" },
    });
  }

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
