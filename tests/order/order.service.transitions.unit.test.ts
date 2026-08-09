/**
 * Order Service — status transitions.
 *
 * `VALID_TRANSITIONS` is the order lifecycle in one object, and nothing else
 * enforces it: a wrong entry silently lets an order jump from PENDING straight
 * to DELIVERED, or lets a cancelled order come back to life. So rather than
 * spot-checking a few paths, this walks **every** ordered pair of statuses and
 * asserts the service agrees with the table — 36 combinations, generated.
 *
 * The table is also asserted directly, because a test derived only from it
 * would happily ratify a table that had been edited wrongly.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/modules/order/order.repository", () => ({
  orderRepository: {
    transaction: vi.fn(),
    findById: vi.fn(),
    appendTimelineEntry: vi.fn(),
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

vi.mock("../../src/modules/cart/cart.service", () => ({
  cartService: { lockByOwnerWithItems: vi.fn(), clearCart: vi.fn() },
}));

vi.mock("../../src/modules/address/address.service", () => ({
  addressService: { findById: vi.fn() },
}));

vi.mock("../../src/modules/payment/payment.service", () => ({
  paymentService: {
    processPayment: vi.fn(),
    // Cash has no gateway phase; armed in `beforeEach` to return nothing.
    initiatePayment: vi.fn(),
  },
}));

import { orderService } from "../../src/modules/order/order.service";
import { orderRepository } from "../../src/modules/order/order.repository";
import { orderItemRepository } from "../../src/modules/orderItem/orderItem.repository";
import { menuItemService } from "../../src/modules/menuItem/menuItem.service";
import { transactionService } from "../../src/modules/transaction/transaction.service";
import { paymentService } from "../../src/modules/payment/payment.service";
import { notificationService } from "../../src/modules/notification/notification.service";
import {
  ORDER_STATUSES,
  VALID_TRANSITIONS,
  type OrderStatusValue,
} from "../../src/modules/order/order.status";
import { orderErrors } from "../../src/shared/exceptions/order.errors";
import { Prisma } from "../../src/generated/prisma/client";

const mockedOrders = vi.mocked(orderRepository);
const mockedOrderItems = vi.mocked(orderItemRepository);
const mockedMenuItems = vi.mocked(menuItemService);
const mockedTransactions = vi.mocked(transactionService);
const mockedNotifications = vi.mocked(notificationService);

const tx = {} as never;
const now = new Date("2026-08-06T10:00:00.000Z");

const orderAt = (status: OrderStatusValue) =>
  ({
    id: "order_1",
    customerId: "cust_1",
    addressId: "addr_1",
    restaurantId: "rest_1",
    orderDate: now,
    status,
    totalAmount: new Prisma.Decimal(90),
    timeline: [],
    createdAt: now,
    updatedAt: now,
  }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  // Cash never reaches a gateway, so the post-commit phase returns nothing.
  vi.mocked(paymentService).initiatePayment.mockResolvedValue({});
  mockedOrders.transaction.mockImplementation(
    async (cb: (client: never) => Promise<unknown>) => cb(tx),
  );
  mockedOrderItems.findManyByOrderIdWithTx.mockResolvedValue([] as never);
  mockedOrders.appendTimelineEntry.mockImplementation(
    async (_id, entry) =>
      ({ status: entry.status, timeline: [entry], updatedAt: now }) as never,
  );
});

describe("the transition table itself", () => {
  it("has an entry for every status — a missing key is an unreachable order", () => {
    expect(Object.keys(VALID_TRANSITIONS).sort()).toEqual(
      [...ORDER_STATUSES].sort(),
    );
  });

  it("is exactly the intended lifecycle", () => {
    // Spelled out rather than derived, so an accidental edit to the table
    // fails here instead of being ratified by the generated tests below.
    expect(VALID_TRANSITIONS).toEqual({
      PENDING: ["CONFIRMED", "CANCELLED"],
      CONFIRMED: ["PREPARING", "CANCELLED"],
      PREPARING: ["OUT_FOR_DELIVERY"],
      OUT_FOR_DELIVERY: ["DELIVERED"],
      DELIVERED: [],
      CANCELLED: [],
    });
  });

  it("treats DELIVERED and CANCELLED as terminal", () => {
    expect(VALID_TRANSITIONS.DELIVERED).toEqual([]);
    expect(VALID_TRANSITIONS.CANCELLED).toEqual([]);
  });

  it("never lets a status transition to itself", () => {
    for (const status of ORDER_STATUSES) {
      expect(VALID_TRANSITIONS[status]).not.toContain(status);
    }
  });

  it("stops accepting cancellation once the order is out for delivery", () => {
    // The point at which the restaurant has already committed the food.
    expect(VALID_TRANSITIONS.PREPARING).not.toContain("CANCELLED");
    expect(VALID_TRANSITIONS.OUT_FOR_DELIVERY).not.toContain("CANCELLED");
  });
});

describe("updateOrderStatus honours the table for every pair", () => {
  const pairs = ORDER_STATUSES.flatMap((from) =>
    ORDER_STATUSES.map((to) => ({
      from,
      to,
      allowed: VALID_TRANSITIONS[from].includes(to),
    })),
  );

  it.each(pairs)(
    "$from -> $to (allowed: $allowed)",
    async ({ from, to, allowed }) => {
      mockedOrders.findById.mockResolvedValue(orderAt(from));

      const call = orderService.updateOrderStatus("order_1", { status: to });

      if (allowed) {
        await expect(call).resolves.toMatchObject({ status: to });
      } else {
        await expect(call).rejects.toMatchObject({
          message: `Cannot transition from ${from} to ${to}`,
          statusCode: orderErrors.INVALID_STATUS_TRANSITION.statusCode,
        });
        expect(mockedOrders.appendTimelineEntry).not.toHaveBeenCalled();
      }
    },
  );
});

describe("the write itself is guarded", () => {
  it("passes the current status as a precondition, so a concurrent change loses", async () => {
    mockedOrders.findById.mockResolvedValue(orderAt("PENDING"));

    await orderService.updateOrderStatus("order_1", { status: "CONFIRMED" });

    // The UPDATE only matches while the row is still PENDING — the check
    // above is advisory, this is what actually makes it safe.
    expect(mockedOrders.appendTimelineEntry).toHaveBeenCalledWith(
      "order_1",
      expect.objectContaining({ status: "CONFIRMED" }),
      "PENDING",
      tx,
    );
  });

  it("turns a lost race into 409 rather than a silent no-op", async () => {
    mockedOrders.findById.mockResolvedValue(orderAt("PENDING"));
    // Null means the precondition failed — someone moved the order first.
    mockedOrders.appendTimelineEntry.mockResolvedValue(null);

    await expect(
      orderService.updateOrderStatus("order_1", { status: "CONFIRMED" }),
    ).rejects.toMatchObject({
      statusCode: orderErrors.INVALID_STATUS_TRANSITION.statusCode,
    });
    expect(mockedNotifications.notifyOrderStatusChanged).not.toHaveBeenCalled();
  });

  it("404s an order that does not exist without touching the timeline", async () => {
    mockedOrders.findById.mockResolvedValue(null);

    await expect(
      orderService.updateOrderStatus("nope", { status: "CONFIRMED" }),
    ).rejects.toMatchObject({
      statusCode: orderErrors.ORDER_NOT_FOUND.statusCode,
    });
    expect(mockedOrders.appendTimelineEntry).not.toHaveBeenCalled();
  });
});

describe("financial side effects follow the status", () => {
  beforeEach(() => {
    mockedOrderItems.findManyByOrderIdWithTx.mockResolvedValue([
      {
        id: "oi_1",
        orderId: "order_1",
        menuItemId: "item_1",
        quantity: 2,
        price: new Prisma.Decimal(30),
        name: "Koshary",
        createdAt: now,
        updatedAt: now,
      },
    ] as never);
  });

  it("refunds and returns stock on CANCELLED", async () => {
    mockedOrders.findById.mockResolvedValue(orderAt("PENDING"));

    await orderService.updateOrderStatus("order_1", { status: "CANCELLED" });

    expect(mockedTransactions.refundOrderTransactions).toHaveBeenCalledWith(
      "order_1",
      tx,
    );
    expect(mockedMenuItems.releaseStock).toHaveBeenCalledWith("item_1", 2, tx);
    expect(mockedTransactions.settleOrderTransactions).not.toHaveBeenCalled();
  });

  it("settles payment on DELIVERED, and returns nothing to stock", async () => {
    mockedOrders.findById.mockResolvedValue(orderAt("OUT_FOR_DELIVERY"));

    await orderService.updateOrderStatus("order_1", { status: "DELIVERED" });

    expect(mockedTransactions.settleOrderTransactions).toHaveBeenCalledWith(
      "order_1",
      tx,
    );
    expect(mockedTransactions.refundOrderTransactions).not.toHaveBeenCalled();
    expect(mockedMenuItems.releaseStock).not.toHaveBeenCalled();
  });

  it("moves no money for the intermediate statuses", async () => {
    mockedOrders.findById.mockResolvedValue(orderAt("CONFIRMED"));

    await orderService.updateOrderStatus("order_1", { status: "PREPARING" });

    expect(mockedTransactions.refundOrderTransactions).not.toHaveBeenCalled();
    expect(mockedTransactions.settleOrderTransactions).not.toHaveBeenCalled();
    expect(mockedMenuItems.releaseStock).not.toHaveBeenCalled();
  });

  it("runs the side effect inside the transaction, before the notification", async () => {
    mockedOrders.findById.mockResolvedValue(orderAt("OUT_FOR_DELIVERY"));

    await orderService.updateOrderStatus("order_1", { status: "DELIVERED" });

    const settle =
      mockedTransactions.settleOrderTransactions.mock.invocationCallOrder[0]!;
    const notify =
      mockedNotifications.notifyOrderStatusChanged.mock.invocationCallOrder[0]!;
    // The customer is only told about state that actually committed.
    expect(settle).toBeLessThan(notify);
  });
});
