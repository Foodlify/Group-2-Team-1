/**
 * Restaurant ownership — who may see and change which orders.
 *
 * The official scope map names Restaurants as an actor on orders twice
 * ("Restaurants Order History", "Cancelled Orders by Customers or
 * Restaurants"), and this is the rule that makes those safe: the RESTAURANT
 * role gets a caller through the route guard, `Restaurant.ownerId` decides
 * which orders are theirs. A test suite that only checked the role would ratify
 * a system where any restaurant can cancel any other restaurant's orders.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/modules/order/order.repository", () => ({
  orderRepository: {
    transaction: vi.fn(),
    findById: vi.fn(),
    findByIdWithDetails: vi.fn(),
    findPaginatedAll: vi.fn(),
    appendTimelineEntry: vi.fn(),
  },
}));

vi.mock("../../src/modules/restaurant/restaurant.repository", () => ({
  restaurantRepository: {
    findIdsByOwnerId: vi.fn(),
    isOwnedBy: vi.fn(),
  },
}));

vi.mock("../../src/modules/orderItem/orderItem.repository", () => ({
  orderItemRepository: { findManyByOrderIdWithTx: vi.fn() },
}));

vi.mock("../../src/modules/menuItem/menuItem.service", () => ({
  menuItemService: { releaseStock: vi.fn() },
}));

vi.mock("../../src/modules/transaction/transaction.service", () => ({
  transactionService: {
    refundOrderTransactions: vi.fn(),
    settleOrderTransactions: vi.fn(),
  },
}));

vi.mock("../../src/modules/notification/notification.service", () => ({
  notificationService: {
    notifyOrderPlaced: vi.fn(),
    notifyOrderStatusChanged: vi.fn(),
  },
}));

vi.mock("../../src/modules/payment/payment.service", () => ({
  paymentService: {
    processPayment: vi.fn(),
    initiatePayment: vi.fn(),
    refundPayments: vi.fn(),
  },
}));

import { orderService } from "../../src/modules/order/order.service";
import { orderRepository } from "../../src/modules/order/order.repository";
import { restaurantRepository } from "../../src/modules/restaurant/restaurant.repository";
import { orderItemRepository } from "../../src/modules/orderItem/orderItem.repository";
import { orderErrors } from "../../src/shared/exceptions/order.errors";
import type { ScopedOrderQuery } from "../../src/modules/order/order.validation";
import { Prisma } from "../../src/generated/prisma/client";

const mockedOrders = vi.mocked(orderRepository);
const mockedRestaurants = vi.mocked(restaurantRepository);
const mockedOrderItems = vi.mocked(orderItemRepository);

const tx = {} as never;
const now = new Date("2026-08-10T10:00:00.000Z");

const ADMIN = { userId: "user_admin", role: "ADMIN" };
const OWNER = { userId: "user_owner", role: "RESTAURANT" };

const orderRow = {
  id: "order_1",
  customerId: "cust_1",
  addressId: "addr_1",
  restaurantId: "rest_1",
  orderDate: now,
  status: "PENDING",
  totalAmount: new Prisma.Decimal(90),
  timeline: [],
  orderItems: [],
  createdAt: now,
  updatedAt: now,
} as never;

const emptyPage = {
  data: [],
  meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
};

const query: ScopedOrderQuery = { page: 1, limit: 20 };

beforeEach(() => {
  vi.clearAllMocks();
  mockedOrders.transaction.mockImplementation(
    async (fn: (client: never) => unknown) => fn(tx),
  );
  mockedOrders.findById.mockResolvedValue(orderRow);
  mockedOrders.findByIdWithDetails.mockResolvedValue(orderRow);
  mockedOrders.appendTimelineEntry.mockResolvedValue({
    status: "CONFIRMED",
    timeline: [],
    updatedAt: now,
  });
  mockedOrderItems.findManyByOrderIdWithTx.mockResolvedValue([]);
  mockedOrders.findPaginatedAll.mockResolvedValue(emptyPage as never);
});

// ═══════════════════════════════════════════════════════════
describe("changing an order's status", () => {
  it("lets the owner of the order's restaurant through", async () => {
    mockedRestaurants.isOwnedBy.mockResolvedValue(true);

    await expect(
      orderService.updateOrderStatus("order_1", { status: "CONFIRMED" }, OWNER),
    ).resolves.toMatchObject({ status: "CONFIRMED" });
  });

  it("asks about the order's own restaurant, not one the caller named", async () => {
    mockedRestaurants.isOwnedBy.mockResolvedValue(true);

    await orderService.updateOrderStatus(
      "order_1",
      { status: "CONFIRMED" },
      OWNER,
    );

    // The id comes off the loaded row. Taking it from anywhere the caller can
    // influence would let an owner name a restaurant they do own while acting
    // on an order belonging to one they don't.
    expect(mockedRestaurants.isOwnedBy).toHaveBeenCalledWith(
      "rest_1",
      "user_owner",
    );
  });

  it("403s a restaurant acting on someone else's order", async () => {
    mockedRestaurants.isOwnedBy.mockResolvedValue(false);

    await expect(
      orderService.updateOrderStatus("order_1", { status: "CONFIRMED" }, OWNER),
    ).rejects.toMatchObject({
      message: orderErrors.ORDER_FORBIDDEN.message,
      statusCode: orderErrors.ORDER_FORBIDDEN.statusCode,
    });
  });

  it("writes nothing when the check fails", async () => {
    mockedRestaurants.isOwnedBy.mockResolvedValue(false);

    await expect(
      orderService.updateOrderStatus("order_1", { status: "CONFIRMED" }, OWNER),
    ).rejects.toThrow();

    // A 403 that still moved the order would be a 403 in name only.
    expect(mockedOrders.appendTimelineEntry).not.toHaveBeenCalled();
  });

  it("refuses before deciding whether the transition is legal", async () => {
    mockedRestaurants.isOwnedBy.mockResolvedValue(false);

    // PENDING -> DELIVERED is an invalid transition. Answering with that
    // instead of a 403 would confirm the order exists and reveal its current
    // status to someone with no standing to ask.
    await expect(
      orderService.updateOrderStatus("order_1", { status: "DELIVERED" }, OWNER),
    ).rejects.toMatchObject({
      statusCode: orderErrors.ORDER_FORBIDDEN.statusCode,
    });
  });

  it("lets an admin through without consulting ownership at all", async () => {
    await orderService.updateOrderStatus(
      "order_1",
      { status: "CONFIRMED" },
      ADMIN,
    );

    // Not merely allowed — never asked. The platform operator is not scoped to
    // a restaurant, so the lookup could only ever answer "yes".
    expect(mockedRestaurants.isOwnedBy).not.toHaveBeenCalled();
  });

  it("gives a restaurant the same 403 message a customer gets", async () => {
    mockedRestaurants.isOwnedBy.mockResolvedValue(false);

    // Deliberately indistinguishable: a distinct message would let a probe
    // map which restaurants exist and who runs them.
    await expect(
      orderService.updateOrderStatus("order_1", { status: "CONFIRMED" }, OWNER),
    ).rejects.toMatchObject({
      message: "This order does not belong to you",
    });
  });
});

// ═══════════════════════════════════════════════════════════
describe("Restaurants Order History", () => {
  it("scopes to the restaurants the caller runs", async () => {
    mockedRestaurants.findIdsByOwnerId.mockResolvedValue(["rest_1", "rest_2"]);

    await orderService.listRestaurantOrders("user_owner", query);

    expect(mockedOrders.findPaginatedAll).toHaveBeenCalledWith(
      expect.objectContaining({ restaurantIds: ["rest_1", "rest_2"] }),
    );
  });

  it("resolves ownership per request rather than trusting the token", async () => {
    mockedRestaurants.findIdsByOwnerId.mockResolvedValue([]);

    await orderService.listRestaurantOrders("user_owner", query);

    // An admin who reassigns a restaurant has to take effect on the next
    // request, not when a fifteen-minute access token happens to expire.
    expect(mockedRestaurants.findIdsByOwnerId).toHaveBeenCalledWith(
      "user_owner",
    );
  });

  it("filters to nothing for an owner who runs no restaurant", async () => {
    mockedRestaurants.findIdsByOwnerId.mockResolvedValue([]);

    await orderService.listRestaurantOrders("user_owner", query);

    // The dangerous bug this guards: reading an empty list as "no filter" and
    // handing over every order on the platform.
    expect(mockedOrders.findPaginatedAll).toHaveBeenCalledWith(
      expect.objectContaining({ restaurantIds: [] }),
    );
  });

  it("narrows to a named restaurant when the caller owns it", async () => {
    mockedRestaurants.findIdsByOwnerId.mockResolvedValue(["rest_1", "rest_2"]);

    await orderService.listRestaurantOrders("user_owner", {
      ...query,
      restaurantId: "rest_2",
    } as never);

    expect(mockedOrders.findPaginatedAll).toHaveBeenCalledWith(
      expect.objectContaining({ restaurantIds: ["rest_2"] }),
    );
  });

  it("intersects rather than trusts a named restaurant", async () => {
    mockedRestaurants.findIdsByOwnerId.mockResolvedValue(["rest_1"]);

    await orderService.listRestaurantOrders("user_owner", {
      ...query,
      restaurantId: "rest_someone_else",
    } as never);

    // Asking for a restaurant they do not run narrows to nothing. Passing the
    // requested id straight through would be the whole vulnerability.
    expect(mockedOrders.findPaginatedAll).toHaveBeenCalledWith(
      expect.objectContaining({ restaurantIds: [] }),
    );
  });

  it("carries the date and status filters through", async () => {
    mockedRestaurants.findIdsByOwnerId.mockResolvedValue(["rest_1"]);

    await orderService.listRestaurantOrders("user_owner", {
      ...query,
      status: "DELIVERED",
      from: "2026-08-01T00:00:00.000Z",
    } as never);

    expect(mockedOrders.findPaginatedAll).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "DELIVERED",
        from: new Date("2026-08-01T00:00:00.000Z"),
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════
describe("the admin's platform-wide listing", () => {
  it("stays unscoped when no restaurant is named", async () => {
    await orderService.listAllOrders(query);

    // `undefined`, not `[]` — the distinction the repository filter turns on.
    expect(mockedOrders.findPaginatedAll).toHaveBeenCalledWith(
      expect.objectContaining({ restaurantIds: undefined }),
    );
  });

  it("narrows to any restaurant the admin names, owned or not", async () => {
    await orderService.listAllOrders({
      ...query,
      restaurantId: "rest_9",
    } as never);

    expect(mockedOrders.findPaginatedAll).toHaveBeenCalledWith(
      expect.objectContaining({ restaurantIds: ["rest_9"] }),
    );
    expect(mockedRestaurants.findIdsByOwnerId).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════
describe("reading one order as a restaurant", () => {
  it("returns it to the owner of its restaurant", async () => {
    mockedRestaurants.isOwnedBy.mockResolvedValue(true);

    await expect(
      orderService.getRestaurantOrder("user_owner", "order_1"),
    ).resolves.toMatchObject({ id: "order_1" });
  });

  it("403s an order from a restaurant the caller does not run", async () => {
    mockedRestaurants.isOwnedBy.mockResolvedValue(false);

    await expect(
      orderService.getRestaurantOrder("user_owner", "order_1"),
    ).rejects.toMatchObject({
      statusCode: orderErrors.ORDER_FORBIDDEN.statusCode,
    });
  });

  it("404s an order that does not exist, before asking about ownership", async () => {
    mockedOrders.findByIdWithDetails.mockResolvedValue(null);

    await expect(
      orderService.getRestaurantOrder("user_owner", "nope"),
    ).rejects.toMatchObject({
      statusCode: orderErrors.ORDER_NOT_FOUND.statusCode,
    });
    expect(mockedRestaurants.isOwnedBy).not.toHaveBeenCalled();
  });
});
