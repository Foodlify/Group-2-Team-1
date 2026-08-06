import type { PrismaClient } from "../../generated/prisma/client";
import { BaseRepository } from "../../shared/repositories/base.repository";
import prisma from "../../config/prisma";

export class RatingRepository extends BaseRepository<
  PrismaClient["restaurantRate"]
> {
  constructor() {
    super(prisma.restaurantRate);
  }

  async findByCustomerId(customerId: string) {
    return this.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Paginated ratings of one restaurant, newest first, with the rater's display name. */
  async findPaginatedByRestaurant(
    restaurantId: string,
    page: number,
    limit: number,
  ) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      prisma.restaurantRate.findMany({
        where: { restaurantId },
        include: { customer: { select: { user: { select: { name: true } } } } },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.restaurantRate.count({ where: { restaurantId } }),
    ]);
    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /** Average + count computed in SQL — rating rows are never loaded into JS for this. */
  async getRestaurantStats(restaurantId: string) {
    const stats = await prisma.restaurantRate.aggregate({
      where: { restaurantId },
      _avg: { rating: true },
      _count: true,
    });
    return { averageRating: stats._avg.rating, ratingsCount: stats._count };
  }
}

export const ratingRepository = new RatingRepository();
