/**
 * Rating Service — unit tests.
 *
 * Repositories are mocked so each test asserts pure service logic —
 * "IF the repository returns X, THEN the service does Y" — with no database.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/modules/rating/rating.repository", () => ({
  ratingRepository: {
    create: vi.fn(),
    findByCustomerId: vi.fn(),
    findPaginatedByRestaurant: vi.fn(),
    getRestaurantStats: vi.fn(),
    topRatedRestaurants: vi.fn(),
  },
}));

vi.mock("../../src/modules/order/order.repository", () => ({
  orderRepository: {
    findById: vi.fn(),
    distinctRestaurantIdsForCustomer: vi.fn(),
  },
}));

vi.mock("../../src/modules/restaurant/restaurant.repository", () => ({
  restaurantRepository: {
    findById: vi.fn(),
  },
}));

import { ratingService } from "../../src/modules/rating/rating.service";
import { ratingRepository } from "../../src/modules/rating/rating.repository";
import { orderRepository } from "../../src/modules/order/order.repository";
import { restaurantRepository } from "../../src/modules/restaurant/restaurant.repository";
import { ratingErrors } from "../../src/shared/exceptions/rating.errors";
import { catalogErrors } from "../../src/shared/exceptions/catalog.errors";

const mockedRates = vi.mocked(ratingRepository);
const mockedOrders = vi.mocked(orderRepository);
const mockedRestaurants = vi.mocked(restaurantRepository);

type OrderRow = NonNullable<
  Awaited<ReturnType<typeof orderRepository.findById>>
>;
type RestaurantRow = NonNullable<
  Awaited<ReturnType<typeof restaurantRepository.findById>>
>;

const now = new Date("2026-08-06T10:00:00.000Z");
const deliveredOrder = {
  id: "order_1",
  customerId: "cust_1",
  restaurantId: "rest_1",
  status: "DELIVERED",
} as unknown as OrderRow;

const rateRow = {
  id: "rate_1",
  restaurantId: "rest_1",
  orderId: "order_1",
  customerId: "cust_1",
  rating: 5,
  comment: "Great",
  createdAt: now,
  updatedAt: now,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("rateOrder", () => {
  it("creates the rating with the restaurantId derived from the order", async () => {
    mockedOrders.findById.mockResolvedValue(deliveredOrder);
    mockedRates.create.mockResolvedValue(rateRow);

    const result = await ratingService.rateOrder("cust_1", {
      orderId: "order_1",
      rating: 5,
      comment: "Great",
    });

    expect(mockedRates.create).toHaveBeenCalledWith({
      data: {
        orderId: "order_1",
        // Derived from the order row — the client never supplies it.
        restaurantId: "rest_1",
        customerId: "cust_1",
        rating: 5,
        comment: "Great",
      },
    });
    expect(result).toMatchObject({
      rating: 5,
      comment: "Great",
      createdAt: now.toISOString(),
    });
  });

  it("throws 404 when the order does not exist", async () => {
    mockedOrders.findById.mockResolvedValue(null);

    await expect(
      ratingService.rateOrder("cust_1", { orderId: "nope", rating: 4 }),
    ).rejects.toMatchObject({
      message: ratingErrors.ORDER_NOT_FOUND.message,
      statusCode: ratingErrors.ORDER_NOT_FOUND.statusCode,
    });
    expect(mockedRates.create).not.toHaveBeenCalled();
  });

  it("throws 404 (not 403) when the order belongs to another customer", async () => {
    mockedOrders.findById.mockResolvedValue(deliveredOrder);

    await expect(
      ratingService.rateOrder("someone_else", {
        orderId: "order_1",
        rating: 4,
      }),
    ).rejects.toMatchObject({
      statusCode: ratingErrors.ORDER_NOT_FOUND.statusCode,
    });
    expect(mockedRates.create).not.toHaveBeenCalled();
  });

  it("rejects rating an order that is not DELIVERED yet", async () => {
    mockedOrders.findById.mockResolvedValue({
      ...deliveredOrder,
      status: "PENDING",
    } as unknown as OrderRow);

    await expect(
      ratingService.rateOrder("cust_1", { orderId: "order_1", rating: 4 }),
    ).rejects.toMatchObject({
      message: ratingErrors.ORDER_NOT_DELIVERED.message,
      statusCode: ratingErrors.ORDER_NOT_DELIVERED.statusCode,
    });
    expect(mockedRates.create).not.toHaveBeenCalled();
  });

  it("translates the DB unique violation into ALREADY_RATED (409)", async () => {
    mockedOrders.findById.mockResolvedValue(deliveredOrder);
    // Shape matched by `isUniqueViolation` (Prisma P2002).
    mockedRates.create.mockRejectedValue({ code: "P2002" });

    await expect(
      ratingService.rateOrder("cust_1", { orderId: "order_1", rating: 4 }),
    ).rejects.toMatchObject({
      message: ratingErrors.ALREADY_RATED.message,
      statusCode: ratingErrors.ALREADY_RATED.statusCode,
    });
  });
});

describe("listMine", () => {
  it("maps rows to responses without a customerName", async () => {
    mockedRates.findByCustomerId.mockResolvedValue([rateRow]);

    const result = await ratingService.listMine("cust_1");

    expect(mockedRates.findByCustomerId).toHaveBeenCalledWith("cust_1");
    expect(result).toEqual([
      {
        id: "rate_1",
        restaurantId: "rest_1",
        orderId: "order_1",
        customerId: "cust_1",
        rating: 5,
        comment: "Great",
        createdAt: now.toISOString(),
      },
    ]);
  });
});

describe("listForRestaurant", () => {
  it("throws 404 for an unknown restaurant", async () => {
    mockedRestaurants.findById.mockResolvedValue(null);

    await expect(
      ratingService.listForRestaurant("nope", { page: 1, limit: 20 }),
    ).rejects.toMatchObject({
      statusCode: catalogErrors.RESTAURANT_NOT_FOUND.statusCode,
    });
    expect(mockedRates.getRestaurantStats).not.toHaveBeenCalled();
  });

  it("merges the SQL aggregate summary with the paginated page", async () => {
    mockedRestaurants.findById.mockResolvedValue({
      id: "rest_1",
    } as unknown as RestaurantRow);
    mockedRates.getRestaurantStats.mockResolvedValue({
      averageRating: 4.3333,
      ratingsCount: 3,
    });
    const meta = { page: 1, limit: 20, total: 3, totalPages: 1 };
    mockedRates.findPaginatedByRestaurant.mockResolvedValue({
      data: [{ ...rateRow, customer: { user: { name: "Kamal" } } }],
      meta,
    });

    const result = await ratingService.listForRestaurant("rest_1", {
      page: 1,
      limit: 20,
    });

    expect(result.summary).toEqual({ averageRating: 4.3, ratingsCount: 3 });
    expect(result.ratings[0]).toMatchObject({ customerName: "Kamal" });
    expect(result.meta).toEqual(meta);
  });

  it("returns a null average when the restaurant has no ratings yet", async () => {
    mockedRestaurants.findById.mockResolvedValue({
      id: "rest_1",
    } as unknown as RestaurantRow);
    mockedRates.getRestaurantStats.mockResolvedValue({
      averageRating: null,
      ratingsCount: 0,
    });
    mockedRates.findPaginatedByRestaurant.mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });

    const result = await ratingService.listForRestaurant("rest_1", {
      page: 1,
      limit: 20,
    });

    expect(result.summary).toEqual({ averageRating: null, ratingsCount: 0 });
    expect(result.ratings).toEqual([]);
  });
});

describe("discovery", () => {
  it("rounds averages in the top-rated list", async () => {
    mockedRates.topRatedRestaurants.mockResolvedValue([
      {
        restaurantId: "rest_1",
        name: "Koshary El Tahrir",
        averageRating: 4.6667,
        ratingsCount: 3,
      },
    ]);

    const result = await ratingService.topRated({ limit: 10 });

    expect(mockedRates.topRatedRestaurants).toHaveBeenCalledWith(10);
    expect(result).toEqual([
      {
        restaurantId: "rest_1",
        name: "Koshary El Tahrir",
        averageRating: 4.7,
        ratingsCount: 3,
      },
    ]);
  });

  it("excludes already-visited restaurants from recommendations", async () => {
    mockedOrders.distinctRestaurantIdsForCustomer.mockResolvedValue(["rest_9"]);
    mockedRates.topRatedRestaurants.mockResolvedValue([]);

    await ratingService.recommendationsFor("cust_1", { limit: 5 });

    expect(mockedOrders.distinctRestaurantIdsForCustomer).toHaveBeenCalledWith(
      "cust_1",
    );
    expect(mockedRates.topRatedRestaurants).toHaveBeenCalledWith(5, ["rest_9"]);
  });
});
