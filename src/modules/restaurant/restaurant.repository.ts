import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { BaseRepository } from "../../shared/repositories/base.repository";
import prisma from "../../config/prisma";

export class RestaurantRepository extends BaseRepository<PrismaClient["restaurant"]> {
  constructor() {
    super(prisma.restaurant);
  }

  async findById(id: string) {
    return this.findUnique({ where: { id } });
  }

  /** Paginated list with optional case-insensitive name search. */
  async listPaginated(page: number, limit: number, search?: string) {
    const where: Prisma.RestaurantWhereInput = search
      ? { name: { contains: search, mode: "insensitive" } }
      : {};
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      prisma.restaurant.findMany({ where, skip, take: limit, orderBy: { name: "asc" } }),
      prisma.restaurant.count({ where }),
    ]);
    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
}

export const restaurantRepository = new RestaurantRepository();
