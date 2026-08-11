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

  async getRestaurantStats(restaurantId: string) {
    const stats = await prisma.restaurantRate.aggregate({
      where: { restaurantId },
      _avg: { rating: true },
      _count: true,
    });
    return { averageRating: stats._avg.rating, ratingsCount: stats._count };
  }

  async topRatedRestaurants(
    limit: number,
    excludeRestaurantIds: string[] = [],
  ) {
    const grouped = await prisma.restaurantRate.groupBy({
      by: ["restaurantId"],

      where: {
        restaurant: { isDeleted: false },
        ...(excludeRestaurantIds.length > 0
          ? { restaurantId: { notIn: excludeRestaurantIds } }
          : {}),
      },
      _avg: { rating: true },
      _count: { restaurantId: true },
      orderBy: [
        { _avg: { rating: "desc" } },
        { _count: { restaurantId: "desc" } },
      ],
      take: limit,
    });
    if (grouped.length === 0) return [];

    const restaurants = await prisma.restaurant.findMany({
      where: { id: { in: grouped.map((g) => g.restaurantId) } },
      select: { id: true, name: true },
    });
    const names = new Map(restaurants.map((r) => [r.id, r.name]));

    return grouped.map((g) => ({
      restaurantId: g.restaurantId,
      name: names.get(g.restaurantId) ?? "",
      averageRating: g._avg.rating,
      ratingsCount: g._count.restaurantId,
    }));
  }
}

export const ratingRepository = new RatingRepository();
