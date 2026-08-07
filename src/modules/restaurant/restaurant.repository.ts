import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { BaseRepository } from "../../shared/repositories/base.repository";
import prisma from "../../config/prisma";

/** See `menuItem.repository` — same rule: every read hides soft-deleted rows. */
const notDeleted = { isDeleted: false } as const;

export class RestaurantRepository extends BaseRepository<
  PrismaClient["restaurant"]
> {
  constructor() {
    super(prisma.restaurant);
  }

  async findById(id: string) {
    return prisma.restaurant.findFirst({ where: { id, ...notDeleted } });
  }

  /** Restore is the only caller that legitimately wants a deleted row. */
  async findByIdIncludingDeleted(id: string) {
    return this.findUnique({ where: { id } });
  }

  /**
   * Paginated list with optional case-insensitive name search.
   * `includeDeleted` is honoured for admins only — see `restaurant.service`.
   */
  async listPaginated(
    page: number,
    limit: number,
    search?: string,
    includeDeleted = false,
  ) {
    const where: Prisma.RestaurantWhereInput = {
      ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
      ...(includeDeleted ? {} : notDeleted),
    };
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      prisma.restaurant.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: "asc" },
      }),
      prisma.restaurant.count({ where }),
    ]);
    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // ─── Soft delete ──────────────────────────────────────
  async softDeleteById(
    id: string,
    actorId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await (tx ?? prisma).restaurant.update({
      where: { id },
      data: { isDeleted: true, updatedBy: actorId },
    });
  }

  async restoreById(
    id: string,
    actorId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await (tx ?? prisma).restaurant.update({
      where: { id },
      data: { isDeleted: false, updatedBy: actorId },
    });
  }
}

export const restaurantRepository = new RestaurantRepository();
