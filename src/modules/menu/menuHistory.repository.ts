import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { BaseRepository } from "../../shared/repositories/base.repository";
import prisma from "../../config/prisma";
import type {
  MenuChangeActionValue,
  MenuChangeEntityValue,
} from "./menu.model";

export class MenuHistoryRepository extends BaseRepository<
  PrismaClient["menuChangeLog"]
> {
  constructor() {
    super(prisma.menuChangeLog);
  }

  /**
   * Appends one audit entry — called by the menu/menuItem services after a
   * mutation. `changedBy` is the id of the User behind it: the snapshot says
   * what the row became, this says who made it so.
   */
  async log(entry: {
    menuId: string;
    entity: MenuChangeEntityValue;
    entityId: string;
    action: MenuChangeActionValue;
    snapshot: Prisma.InputJsonValue;
    changedBy?: string;
  }) {
    return this.create({ data: entry });
  }

  /** Paginated history of one menu, newest first. */
  async findPaginatedByMenu(menuId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      prisma.menuChangeLog.findMany({
        where: { menuId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.menuChangeLog.count({ where: { menuId } }),
    ]);
    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
}

export const menuHistoryRepository = new MenuHistoryRepository();
