import type { PrismaClient } from "../../generated/prisma/client";
import type { Prisma } from "../../generated/prisma/client";
import { BaseRepository } from "../../shared/repositories/base.repository";
import prisma from "../../config/prisma";

const notDeleted = { isDeleted: false } as const;

export class MenuItemRepository extends BaseRepository<
  PrismaClient["menuItem"]
> {
  constructor() {
    super(prisma.menuItem);
  }

  async findById(id: string) {
    return prisma.menuItem.findFirst({ where: { id, ...notDeleted } });
  }

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

  async findByMenuId(menuId: string, includeDeleted = false) {
    return prisma.menuItem.findMany({
      where: { menuId, ...(includeDeleted ? {} : notDeleted) },
      orderBy: { createdAt: "asc" },
    });
  }

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

  async searchPaginated(page: number, limit: number, search?: string) {
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
