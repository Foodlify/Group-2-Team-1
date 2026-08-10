/**
 * The daily and monthly counters the scope map names.
 *
 * These cannot be proved with mocks: every one is a `WHERE` clause that a real
 * PostgreSQL has to agree with, and the interesting cases live exactly on the
 * boundaries — an order at 00:00:00.000 today, one at 23:59:59.999 yesterday,
 * one on the last day of last month.
 *
 * The clock is frozen so those boundaries are known. Only `Date` is faked;
 * faking timers as well would stall the database driver.
 */
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

/** Mid-month and mid-day, so "today" and "this month" are plainly different. */
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

/**
 * Today: two still owed, one cancelled, one delivered.
 * Earlier this month: one pending, one cancelled.
 * Last month: one cancelled.
 */
const seedSpread = async () => {
  await placeOrderAt(ctx, NOW, "PENDING");
  await placeOrderAt(ctx, NOW, "CONFIRMED");
  await placeOrderAt(ctx, NOW, "CANCELLED");
  await placeOrderAt(ctx, NOW, "DELIVERED");
  await placeOrderAt(ctx, new Date("2026-08-03T09:00:00.000Z"), "PENDING");
  await placeOrderAt(ctx, new Date("2026-08-03T09:00:00.000Z"), "CANCELLED");
  await placeOrderAt(ctx, new Date("2026-07-20T09:00:00.000Z"), "CANCELLED");
};

// ═══════════════════════════════════════════════════════════
describe("Daily / Monthly Cancelled Orders", () => {
  it("counts today's cancellations, this month's, and all time separately", async () => {
    await seedSpread();

    const overview = await dashboardService.getOverview();

    expect(overview.counters.cancelledOrdersToday).toBe(1);
    expect(overview.counters.cancelledOrdersThisMonth).toBe(2);
    // Three cancellations exist; only the all-time counter sees the one from
    // last month.
    expect(overview.counters.cancelledOrders).toBe(3);
  });

  it("includes an order at exactly 00:00:00.000 today", async () => {
    await placeOrderAt(ctx, DAY_START, "CANCELLED");

    const overview = await dashboardService.getOverview();

    // `gte`, not `gt` — an order placed on the stroke of midnight belongs to
    // the day that just started.
    expect(overview.counters.cancelledOrdersToday).toBe(1);
  });

  it("excludes an order one millisecond before today", async () => {
    await placeOrderAt(ctx, new Date(DAY_START.getTime() - 1), "CANCELLED");

    const overview = await dashboardService.getOverview();

    expect(overview.counters.cancelledOrdersToday).toBe(0);
    // Still inside the month, so the monthly counter must see it — the pair is
    // what proves the two windows are genuinely different.
    expect(overview.counters.cancelledOrdersThisMonth).toBe(1);
  });

  it("excludes an order one millisecond before the month", async () => {
    await placeOrderAt(ctx, new Date(MONTH_START.getTime() - 1), "CANCELLED");

    const overview = await dashboardService.getOverview();

    expect(overview.counters.cancelledOrdersThisMonth).toBe(0);
    expect(overview.counters.cancelledOrders).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════
describe("Daily Orders not Delivered Count", () => {
  it("counts today's orders that are still owed to a customer", async () => {
    await seedSpread();

    const report = await dashboardService.getRestaurantReport(
      ctx.restaurantId,
      { granularity: "day" },
    );

    // PENDING + CONFIRMED from today. The delivered one is done and the
    // cancelled one is not owed to anybody.
    expect(report.counters.notDeliveredToday).toBe(2);
  });

  it("excludes cancelled orders, not only delivered ones", async () => {
    await placeOrderAt(ctx, NOW, "CANCELLED");
    await placeOrderAt(ctx, NOW, "DELIVERED");

    const report = await dashboardService.getRestaurantReport(
      ctx.restaurantId,
      { granularity: "day" },
    );

    // The literal reading — "status is not DELIVERED" — would answer 1 here.
    // The map lists cancelled orders as their own counter beside this one, so
    // the two are read as a partition.
    expect(report.counters.notDeliveredToday).toBe(0);
  });

  it("ignores orders still outstanding from before today", async () => {
    await placeOrderAt(ctx, new Date("2026-08-03T09:00:00.000Z"), "PENDING");

    const report = await dashboardService.getRestaurantReport(
      ctx.restaurantId,
      { granularity: "day" },
    );

    // It is a daily counter, not a backlog. An older unfinished order is a
    // different question the map does not ask.
    expect(report.counters.notDeliveredToday).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
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

    // `ordersInRange` follows the window; the named counters must not, or
    // "today" would mean whatever the caller last asked for.
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

    // The system overview, by contrast, sees both restaurants.
    const overview = await dashboardService.getOverview();
    expect(overview.counters.ordersToday).toBe(6);
    expect(overview.counters.cancelledOrdersToday).toBe(2);
  });
});
