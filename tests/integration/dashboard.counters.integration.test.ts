import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import prisma from "../../src/config/prisma";
import { dashboardService } from "../../src/modules/dashboard/dashboard.service";
import { Prisma } from "../../src/generated/prisma/client";
import {
  createCatalog,
  createCustomer,
  disconnect,
  resetDatabase,
} from "./helpers/db";

const NOW = new Date("2026-08-15T12:00:00.000Z");
const DAY_START = new Date("2026-08-15T00:00:00.000Z");
const MONTH_START = new Date("2026-08-01T00:00:00.000Z");

type Ctx = {
  customerId: string;
  addressId: string;
  restaurantId: string;
};

const placeOrderAt = async (
  ctx: Ctx,
  orderDate: Date,
  status: "PENDING" | "CONFIRMED" | "DELIVERED" | "CANCELLED",
) =>
  prisma.order.create({
    data: {
      customerId: ctx.customerId,
      addressId: ctx.addressId,
      restaurantId: ctx.restaurantId,
      orderDate,
      status,
      totalAmount: new Prisma.Decimal("50.00"),
    },
  });

let ctx: Ctx;

beforeEach(async () => {
  await resetDatabase();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);

  const { customer, address } = await createCustomer();
  const { restaurant } = await createCatalog();
  ctx = {
    customerId: customer.id,
    addressId: address.id,
    restaurantId: restaurant.id,
  };
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await disconnect();
});

const seedSpread = async () => {
  await placeOrderAt(ctx, NOW, "PENDING");
  await placeOrderAt(ctx, NOW, "CONFIRMED");
  await placeOrderAt(ctx, NOW, "CANCELLED");
  await placeOrderAt(ctx, NOW, "DELIVERED");
  await placeOrderAt(ctx, new Date("2026-08-03T09:00:00.000Z"), "PENDING");
  await placeOrderAt(ctx, new Date("2026-08-03T09:00:00.000Z"), "CANCELLED");
  await placeOrderAt(ctx, new Date("2026-07-20T09:00:00.000Z"), "CANCELLED");
};

describe("Daily / Monthly Cancelled Orders", () => {
  it("counts today's cancellations, this month's, and all time separately", async () => {
    await seedSpread();

    const overview = await dashboardService.getOverview();

    expect(overview.counters.cancelledOrdersToday).toBe(1);
    expect(overview.counters.cancelledOrdersThisMonth).toBe(2);

    expect(overview.counters.cancelledOrders).toBe(3);
  });

  it("includes an order at exactly 00:00:00.000 today", async () => {
    await placeOrderAt(ctx, DAY_START, "CANCELLED");

    const overview = await dashboardService.getOverview();

    expect(overview.counters.cancelledOrdersToday).toBe(1);
  });

  it("excludes an order one millisecond before today", async () => {
    await placeOrderAt(ctx, new Date(DAY_START.getTime() - 1), "CANCELLED");

    const overview = await dashboardService.getOverview();

    expect(overview.counters.cancelledOrdersToday).toBe(0);

    expect(overview.counters.cancelledOrdersThisMonth).toBe(1);
  });

  it("excludes an order one millisecond before the month", async () => {
    await placeOrderAt(ctx, new Date(MONTH_START.getTime() - 1), "CANCELLED");

    const overview = await dashboardService.getOverview();

    expect(overview.counters.cancelledOrdersThisMonth).toBe(0);
    expect(overview.counters.cancelledOrders).toBe(1);
  });
});

describe("Daily Orders not Delivered Count", () => {
  it("counts today's orders that are still owed to a customer", async () => {
    await seedSpread();

    const report = await dashboardService.getRestaurantReport(
      ctx.restaurantId,
      { granularity: "day" },
    );

    expect(report.counters.notDeliveredToday).toBe(2);
  });

  it("excludes cancelled orders, not only delivered ones", async () => {
    await placeOrderAt(ctx, NOW, "CANCELLED");
    await placeOrderAt(ctx, NOW, "DELIVERED");

    const report = await dashboardService.getRestaurantReport(
      ctx.restaurantId,
      { granularity: "day" },
    );

    expect(report.counters.notDeliveredToday).toBe(0);
  });

  it("ignores orders still outstanding from before today", async () => {
    await placeOrderAt(ctx, new Date("2026-08-03T09:00:00.000Z"), "PENDING");

    const report = await dashboardService.getRestaurantReport(
      ctx.restaurantId,
      { granularity: "day" },
    );

    expect(report.counters.notDeliveredToday).toBe(0);
  });
});

describe("the restaurant's day and month counters", () => {
  it("reports orders for today and this month", async () => {
    await seedSpread();

    const report = await dashboardService.getRestaurantReport(
      ctx.restaurantId,
      { granularity: "day" },
    );

    expect(report.counters.ordersToday).toBe(4);
    expect(report.counters.ordersThisMonth).toBe(6);
    expect(report.counters.orders).toBe(7);
    expect(report.counters.cancelledOrdersToday).toBe(1);
    expect(report.counters.cancelledOrdersThisMonth).toBe(2);
  });

  it("does not move when the caller changes the report window", async () => {
    await seedSpread();

    const wide = await dashboardService.getRestaurantReport(ctx.restaurantId, {
      granularity: "day",
      from: "2026-07-01T00:00:00.000Z",
      to: "2026-08-16T00:00:00.000Z",
    });
    const narrow = await dashboardService.getRestaurantReport(
      ctx.restaurantId,
      {
        granularity: "day",
        from: "2026-08-15T00:00:00.000Z",
        to: "2026-08-16T00:00:00.000Z",
      },
    );

    expect(wide.counters.ordersInRange).toBe(7);
    expect(narrow.counters.ordersInRange).toBe(4);
    expect(wide.counters.ordersToday).toBe(narrow.counters.ordersToday);
    expect(wide.counters.notDeliveredToday).toBe(
      narrow.counters.notDeliveredToday,
    );
  });

  it("counts only its own restaurant's orders", async () => {
    await seedSpread();
    const other = await createCatalog({ name: "Other" });
    await placeOrderAt(
      { ...ctx, restaurantId: other.restaurant.id },
      NOW,
      "CANCELLED",
    );
    await placeOrderAt(
      { ...ctx, restaurantId: other.restaurant.id },
      NOW,
      "PENDING",
    );

    const report = await dashboardService.getRestaurantReport(
      ctx.restaurantId,
      { granularity: "day" },
    );

    expect(report.counters.ordersToday).toBe(4);
    expect(report.counters.cancelledOrdersToday).toBe(1);
    expect(report.counters.notDeliveredToday).toBe(2);

    const overview = await dashboardService.getOverview();
    expect(overview.counters.ordersToday).toBe(6);
    expect(overview.counters.cancelledOrdersToday).toBe(2);
  });
});
