import { appError } from "../../middlewares/error.middleware";
import { isUniqueViolation } from "../../shared/exceptions/prisma.errors";
import { catalogErrors } from "../../shared/exceptions/catalog.errors";
import { ratingErrors } from "../../shared/exceptions/rating.errors";
import type {
  PaginationMeta,
  PaginationQuery,
} from "../../shared/schemas/pagination.schema";
import { OrderStatus } from "../order/order.status";
import { orderRepository } from "../order/order.repository";
import { restaurantRepository } from "../restaurant/restaurant.repository";
import { ratingRepository } from "./rating.repository";
import type { RestaurantRateWithCustomer } from "./rating.model";
import type {
  CreateRatingInput,
  DiscoveryQuery,
  RatingResponse,
  RestaurantRatingsSummary,
  TopRatedRestaurant,
} from "./rating.validation";

class RatingService {
  /**
   * Customer rates the restaurant of one of their DELIVERED orders.
   * The restaurantId comes from the order row, never from the client, so a
   * rating can never point at a different restaurant than the one that
   * actually served the order.
   */
  async rateOrder(
    customerId: string,
    input: CreateRatingInput,
  ): Promise<RatingResponse> {
    const order = await orderRepository.findById(input.orderId);
    // 404 (not 403) for someone else's order — don't reveal the id exists.
    if (!order || order.customerId !== customerId) {
      throw appError(ratingErrors.ORDER_NOT_FOUND);
    }
    if (order.status !== OrderStatus.DELIVERED) {
      throw appError(ratingErrors.ORDER_NOT_DELIVERED);
    }

    try {
      const rate = await ratingRepository.create({
        data: {
          orderId: order.id,
          restaurantId: order.restaurantId,
          customerId,
          rating: input.rating,
          comment: input.comment ?? null,
        },
      });
      return this.toRatingResponse(rate);
    } catch (e) {
      // The unique orderId makes the DB the arbiter of "already rated" —
      // no read-then-insert race.
      if (isUniqueViolation(e)) throw appError(ratingErrors.ALREADY_RATED);
      throw e;
    }
  }

  async listMine(customerId: string): Promise<RatingResponse[]> {
    const rates = await ratingRepository.findByCustomerId(customerId);
    return rates.map((r) => this.toRatingResponse(r));
  }

  /** Public: SQL-aggregated summary + paginated comments, newest first. */
  async listForRestaurant(
    restaurantId: string,
    query: PaginationQuery,
  ): Promise<{
    summary: RestaurantRatingsSummary;
    ratings: RatingResponse[];
    meta: PaginationMeta;
  }> {
    const restaurant = await restaurantRepository.findById(restaurantId);
    if (!restaurant) throw appError(catalogErrors.RESTAURANT_NOT_FOUND);

    const [stats, page] = await Promise.all([
      ratingRepository.getRestaurantStats(restaurantId),
      ratingRepository.findPaginatedByRestaurant(
        restaurantId,
        query.page,
        query.limit,
      ),
    ]);

    return {
      summary: {
        averageRating:
          stats.averageRating === null
            ? null
            : Math.round(stats.averageRating * 10) / 10,
        ratingsCount: stats.ratingsCount,
      },
      ratings: page.data.map((r) => this.toRatingResponse(r)),
      meta: page.meta,
    };
  }

  // ─── Discovery ────────────────────────────────────────
  /** Official "Top Rating Restaurants" — public. */
  async topRated(query: DiscoveryQuery): Promise<TopRatedRestaurant[]> {
    const rows = await ratingRepository.topRatedRestaurants(query.limit);
    return rows.map((r) => this.toTopRated(r));
  }

  /**
   * Official "Restaurants Recommendations" — the top-rated restaurants the
   * customer hasn't ordered from yet. A customer with no order history just
   * gets the plain top-rated list.
   */
  async recommendationsFor(
    customerId: string,
    query: DiscoveryQuery,
  ): Promise<TopRatedRestaurant[]> {
    const visited =
      await orderRepository.distinctRestaurantIdsForCustomer(customerId);
    const rows = await ratingRepository.topRatedRestaurants(
      query.limit,
      visited,
    );
    return rows.map((r) => this.toTopRated(r));
  }

  // ─── Private helpers ──────────────────────────────────
  private toTopRated(r: {
    restaurantId: string;
    name: string;
    averageRating: number | null;
    ratingsCount: number;
  }): TopRatedRestaurant {
    return {
      ...r,
      averageRating:
        r.averageRating === null ? null : Math.round(r.averageRating * 10) / 10,
    };
  }

  private toRatingResponse(r: RestaurantRateWithCustomer): RatingResponse {
    return {
      id: r.id,
      restaurantId: r.restaurantId,
      orderId: r.orderId,
      customerId: r.customerId,
      rating: r.rating,
      comment: r.comment,
      ...(r.customer ? { customerName: r.customer.user.name } : {}),
      createdAt: r.createdAt.toISOString(),
    };
  }
}

export const ratingService = new RatingService();
