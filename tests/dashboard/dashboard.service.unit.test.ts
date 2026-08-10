/**
 * Dashboard reporting.
 *
 * A report is trusted precisely because nobody checks it by hand, which makes
 * a quietly wrong number worse here than almost anywhere else. Three things
 * decide whether these figures are true:
 *
 *   1. refunds are SUBTRACTED, not added — the ledger stores what moved, not
 *      which direction, so a refund row carries a positive amount;
 *   2. only SUCCESS counts — a pending card payment is a customer looking at a
 *      checkout page, not money in the account;
 *   3. money is summed as Decimal — the order module already had to be fixed
 *      once for `8.15 x 3` coming out as 24.450000000000003.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/modules/dashboard/dashboard.repository", () => ({
  dashboardRepository: {
    countRestaurants: vi.fn(),
    countCustomers: vi.fn(),
    countOrders: vi.fn(),
    countTransactions: vi.fn(),
    countOrdersByStatus: vi.fn(),
    sumByType: vi.fn(),
    transactionSeries: vi.fn(),
    findRestaurant: vi.fn(),
  },
}));

import { dashboardService } from "../../src/modules/dashboard/dashboard.service";
import { dashboardRepository } from "../../src/modules/dashboard/dashboard.repository";
import { catalogErrors } from "../../src/shared/exceptions/catalog.errors";
import { Prisma } from "../../src/generated/prisma/client";

const mockedRepo = vi.mocked(dashboardRepository);
const dec = (v: string) => new Prisma.Decimal(v);

const bucket = (
  iso: string,
  type: string,
  total: string,
  count = 1,
): { bucket: Date; type: string; count: number; total: Prisma.Decimal } => ({
  bucket: new Date(iso),
  type,
  count,
  total: dec(total),
});

const query = { granularity: "day" as const, from: undefined, to: undefined };

beforeEach(() => {
  vi.clearAllMocks();
  mockedRepo.countRestaurants.mockResolvedValue(0);
  mockedRepo.countCustomers.mockResolvedValue({ total: 0, active: 0 });
  mockedRepo.countOrders.mockResolvedValue(0);
  mockedRepo.countTransactions.mockResolvedValue(0);
  mockedRepo.countOrdersByStatus.mockResolvedValue(new Map());
  mockedRepo.sumByType.mockResolvedValue(new Map());
  mockedRepo.transactionSeries.mockResolvedValue([]);
  mockedRepo.findRestaurant.mockResolvedValue({
    id: "rest_1",
    name: "Kitchen",
  });
});

// ═══════════════════════════════════════════════════════════
describe("refunds are subtracted from revenue, never added", () => {
  it("nets a refund off the payments in the same bucket", async () => {
    mockedRepo.transactionSeries.mockResolvedValue([
      bucket("2026-08-01T00:00:00.000Z", "ORDER_PAYMENT", "500.00", 5),
      bucket("2026-08-01T00:00:00.000Z", "REFUND", "120.00", 1),
    ]);

    const report = await dashboardService.getTransactionReport(query);

    expect(report.series[0]!.payments).toBe(500);
    expect(report.series[0]!.refunds).toBe(120);
    // Adding them would report 620 — a day of refunds becoming a record day.
    expect(report.series[0]!.net).toBe(380);
  });

  it("counts PARTIAL_REFUND as a refund too", async () => {
    mockedRepo.transactionSeries.mockResolvedValue([
      bucket("2026-08-01T00:00:00.000Z", "ORDER_PAYMENT", "100.00"),
      bucket("2026-08-01T00:00:00.000Z", "PARTIAL_REFUND", "30.00"),
    ]);

    const report = await dashboardService.getTransactionReport(query);

    // A `type === "REFUND"` check would silently miss this and overstate net.
    expect(report.series[0]!.refunds).toBe(30);
    expect(report.series[0]!.net).toBe(70);
  });

  it("reports a net loss rather than clamping it at zero", async () => {
    mockedRepo.transactionSeries.mockResolvedValue([
      bucket("2026-08-02T00:00:00.000Z", "ORDER_PAYMENT", "50.00"),
      bucket("2026-08-02T00:00:00.000Z", "REFUND", "200.00"),
    ]);

    const report = await dashboardService.getTransactionReport(query);

    // Refunding yesterday's orders today is a real negative day. Hiding it
    // would make the books stop adding up across periods.
    expect(report.series[0]!.net).toBe(-150);
  });

  it("nets refunds out of the overview revenue as well", async () => {
    mockedRepo.sumByType.mockResolvedValue(
      new Map([
        ["ORDER_PAYMENT", dec("1000.00")],
        ["REFUND", dec("250.00")],
      ]),
    );

    const overview = await dashboardService.getOverview();

    expect(overview.revenue.allTime.net).toBe(750);
  });
});

// ═══════════════════════════════════════════════════════════
describe("money is exact", () => {
  it("sums prices that float arithmetic gets wrong", async () => {
    // 8.15 + 29.99 ... the values the order module was fixed for.
    mockedRepo.transactionSeries.mockResolvedValue([
      bucket("2026-08-01T00:00:00.000Z", "ORDER_PAYMENT", "24.45"),
      bucket("2026-08-02T00:00:00.000Z", "ORDER_PAYMENT", "209.93"),
    ]);

    const report = await dashboardService.getTransactionReport(query);

    // 24.45 + 209.93 is 234.38000000000002 added as floats.
    expect(report.totals.payments).toBe(234.38);
  });

  it("keeps a long series drift-free", async () => {
    // 11 x 0.07 — float summation drifts to 0.7699999999999999.
    mockedRepo.transactionSeries.mockResolvedValue(
      Array.from({ length: 11 }, (_, i) =>
        bucket(
          `2026-08-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
          "ORDER_PAYMENT",
          "0.07",
        ),
      ),
    );

    const report = await dashboardService.getTransactionReport(query);

    expect(report.totals.payments).toBe(0.77);
  });

  it("nets amounts that only Decimal subtraction gets right", async () => {
    mockedRepo.transactionSeries.mockResolvedValue([
      bucket("2026-08-01T00:00:00.000Z", "ORDER_PAYMENT", "0.30"),
      bucket("2026-08-01T00:00:00.000Z", "REFUND", "0.10"),
    ]);

    const report = await dashboardService.getTransactionReport(query);

    // 0.3 - 0.1 is 0.19999999999999998 in floats.
    expect(report.series[0]!.net).toBe(0.2);
  });
});

// ═══════════════════════════════════════════════════════════
describe("only settled money is reported", () => {
  it("asks the database for SUCCESS transactions only", async () => {
    await dashboardService.getOverview();

    for (const [where] of mockedRepo.sumByType.mock.calls) {
      // A PENDING card payment is a checkout page the customer was shown.
      // Counting it as revenue invents money.
      expect(where).toMatchObject({ status: "SUCCESS" });
    }
  });

  it("scopes a restaurant's revenue through its orders", async () => {
    await dashboardService.getRestaurantReport("rest_1", query);

    // Transactions carry no restaurantId — reaching it any other way would
    // report the whole platform's revenue under one restaurant.
    expect(mockedRepo.sumByType).toHaveBeenCalledWith({
      status: "SUCCESS",
      order: { restaurantId: "rest_1" },
    });
  });
});

// ═══════════════════════════════════════════════════════════
describe("the header always agrees with the rows", () => {
  it("totals are the sum of the series, not a separate query", async () => {
    mockedRepo.transactionSeries.mockResolvedValue([
      bucket("2026-08-01T00:00:00.000Z", "ORDER_PAYMENT", "100.00", 2),
      bucket("2026-08-02T00:00:00.000Z", "ORDER_PAYMENT", "40.00", 1),
      bucket("2026-08-02T00:00:00.000Z", "REFUND", "15.00", 1),
    ]);

    const report = await dashboardService.getTransactionReport(query);

    const summed = report.series.reduce((s, r) => s + r.net, 0);
    expect(report.totals.net).toBe(summed);
    expect(report.totals.net).toBe(125);
    expect(report.transactions).toBe(4);
  });

  it("returns an empty series and zero totals when nothing happened", async () => {
    const report = await dashboardService.getTransactionReport(query);

    expect(report.series).toEqual([]);
    expect(report.totals).toEqual({ payments: 0, refunds: 0, net: 0 });
    expect(report.transactions).toBe(0);
  });

  it("merges rows that share a bucket", async () => {
    mockedRepo.transactionSeries.mockResolvedValue([
      bucket("2026-08-01T00:00:00.000Z", "ORDER_PAYMENT", "10.00"),
      bucket("2026-08-01T00:00:00.000Z", "ORDER_PAYMENT", "20.00"),
    ]);

    const report = await dashboardService.getTransactionReport(query);

    expect(report.series).toHaveLength(1);
    expect(report.series[0]!.payments).toBe(30);
  });

  it("merges rows in one bucket without float drift", async () => {
    // Same bucket, two payment rows. 0.1 + 0.2 is 0.30000000000000004 as
    // floats — the accumulation INSIDE a bucket needs Decimal just as much as
    // the total across buckets, and only same-bucket rows exercise it.
    mockedRepo.transactionSeries.mockResolvedValue([
      bucket("2026-08-01T00:00:00.000Z", "ORDER_PAYMENT", "0.10"),
      bucket("2026-08-01T00:00:00.000Z", "ORDER_PAYMENT", "0.20"),
    ]);

    const report = await dashboardService.getTransactionReport(query);

    expect(report.series[0]!.payments).toBe(0.3);
  });

  it("merges refund rows in one bucket without float drift", async () => {
    mockedRepo.transactionSeries.mockResolvedValue([
      bucket("2026-08-01T00:00:00.000Z", "ORDER_PAYMENT", "1.00"),
      bucket("2026-08-01T00:00:00.000Z", "REFUND", "0.10"),
      bucket("2026-08-01T00:00:00.000Z", "REFUND", "0.20"),
    ]);

    const report = await dashboardService.getTransactionReport(query);

    expect(report.series[0]!.refunds).toBe(0.3);
    expect(report.series[0]!.net).toBe(0.7);
  });
});

// ═══════════════════════════════════════════════════════════
describe("the reporting window", () => {
  it("defaults to the last 30 days", async () => {
    await dashboardService.getTransactionReport(query);

    const [, from, to] = mockedRepo.transactionSeries.mock.calls[0]!;
    const days = (to.getTime() - from.getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(30);
  });

  it("passes an explicit window straight through", async () => {
    await dashboardService.getTransactionReport({
      granularity: "month",
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-07-01T00:00:00.000Z",
    });

    const [granularity, from, to] = mockedRepo.transactionSeries.mock.calls[0]!;
    expect(granularity).toBe("month");
    expect(from.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(to.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  it("reports the window it actually used", async () => {
    const report = await dashboardService.getTransactionReport({
      granularity: "day",
      from: "2026-05-01T00:00:00.000Z",
      to: "2026-05-08T00:00:00.000Z",
    });

    // Without this a caller cannot tell which period the numbers describe.
    expect(report.from).toBe("2026-05-01T00:00:00.000Z");
    expect(report.to).toBe("2026-05-08T00:00:00.000Z");
    expect(report.granularity).toBe("day");
  });
});

// ═══════════════════════════════════════════════════════════
describe("counters", () => {
  it("reports cancelled and delivered orders from the status breakdown", async () => {
    mockedRepo.countOrdersByStatus.mockResolvedValue(
      new Map([
        ["DELIVERED", 12],
        ["CANCELLED", 3],
        ["PENDING", 5],
      ]),
    );

    const overview = await dashboardService.getOverview();

    expect(overview.counters.cancelledOrders).toBe(3);
    expect(overview.counters.deliveredOrders).toBe(12);
    expect(overview.ordersByStatus).toEqual({
      DELIVERED: 12,
      CANCELLED: 3,
      PENDING: 5,
    });
  });

  it("reports zero for a status with no orders instead of undefined", async () => {
    mockedRepo.countOrdersByStatus.mockResolvedValue(new Map([["PENDING", 2]]));

    const overview = await dashboardService.getOverview();

    // `groupBy` omits empty statuses entirely; leaking that as undefined would
    // serialise the field away and break any client reading it.
    expect(overview.counters.cancelledOrders).toBe(0);
    expect(overview.counters.deliveredOrders).toBe(0);
  });

  it("counts today's and this month's orders from UTC boundaries", async () => {
    await dashboardService.getOverview();

    const windows = mockedRepo.countOrders.mock.calls
      .map(([where]) => (where as { orderDate?: { gte: Date } }).orderDate?.gte)
      .filter((d): d is Date => d instanceof Date);

    // Four windows now: orders today and this month, plus cancelled orders
    // over the same two. Asserted as a property of every window rather than by
    // position, so adding a fifth counter cannot break this test without
    // breaking the rule it is really about.
    expect(windows.length).toBeGreaterThanOrEqual(2);
    for (const start of windows) {
      // Anything else means the boundary was taken from the server's local
      // clock, and the same request would answer differently on another host.
      expect(start.getUTCHours()).toBe(0);
      expect(start.getUTCMinutes()).toBe(0);
      expect(start.getUTCSeconds()).toBe(0);
    }
    expect(windows.some((start) => start.getUTCDate() === 1)).toBe(true);
  });

  it("says the boundaries are UTC in the response", async () => {
    const overview = await dashboardService.getOverview();

    expect(overview.timezone).toBe("UTC");
  });
});

// ═══════════════════════════════════════════════════════════
describe("per-restaurant reports", () => {
  it("404s an unknown or soft-deleted restaurant", async () => {
    mockedRepo.findRestaurant.mockResolvedValue(null);

    await expect(
      dashboardService.getRestaurantReport("gone", query),
    ).rejects.toMatchObject({
      statusCode: catalogErrors.RESTAURANT_NOT_FOUND.statusCode,
    });
  });

  it("checks the restaurant exists before reporting on it", async () => {
    mockedRepo.findRestaurant.mockResolvedValue(null);

    await expect(
      dashboardService.getRestaurantReport("gone", query),
    ).rejects.toThrow();

    // An unknown id must not silently return an all-zero report that reads
    // like a real restaurant with no business.
    expect(mockedRepo.transactionSeries).not.toHaveBeenCalled();
  });

  it("scopes the series to the restaurant", async () => {
    await dashboardService.getRestaurantReport("rest_1", query);

    const call = mockedRepo.transactionSeries.mock.calls[0]!;
    expect(call[3]).toBe("rest_1");
  });

  it("scopes every order counter to the restaurant", async () => {
    await dashboardService.getRestaurantReport("rest_1", query);

    for (const [where] of mockedRepo.countOrders.mock.calls) {
      expect(where).toMatchObject({ restaurantId: "rest_1" });
    }
    expect(mockedRepo.countOrdersByStatus).toHaveBeenCalledWith({
      restaurantId: "rest_1",
    });
  });
});

// ═══════════════════════════════════════════════════════════
/**
 * The counters the scope map names by the day and by the month.
 *
 * Every one of these is a `countOrders` call with a different filter, so the
 * mistake to guard against is not arithmetic — it is a counter wired to the
 * wrong window, or to no window at all, which reads as a plausible number
 * forever. Each assertion pins the filter rather than the result.
 */
const wheres = () =>
  mockedRepo.countOrders.mock.calls.map(
    ([where]) => where as Record<string, unknown>,
  );

/** Filters whose `orderDate.gte` is a UTC midnight (the day boundary). */
const isUtcDayStart = (d: Date): boolean =>
  d.getUTCHours() === 0 &&
  d.getUTCMinutes() === 0 &&
  d.getUTCSeconds() === 0 &&
  d.getUTCMilliseconds() === 0;

const isUtcMonthStart = (d: Date): boolean =>
  isUtcDayStart(d) && d.getUTCDate() === 1;

/** The window a filter carries, or undefined for an unwindowed count. */
const gteOf = (w: Record<string, unknown>): Date | undefined =>
  (w.orderDate as { gte?: Date } | undefined)?.gte;

/** True only for `status: { notIn: [...] }`, never for a plain string status. */
const isNotIn = (status: unknown): status is { notIn: string[] } =>
  typeof status === "object" && status !== null && "notIn" in status;

describe("Daily / Monthly Cancelled Orders — system overview", () => {
  it("asks over exactly two windows, both UTC boundaries, one a month start", async () => {
    await dashboardService.getOverview();

    const cancelled = wheres().filter((w) => w.status === "CANCELLED");
    expect(cancelled).toHaveLength(2);
    for (const w of cancelled) {
      const gte = gteOf(w);
      // A boundary taken from the server's local clock would answer
      // differently on another host for the same request.
      expect(gte && isUtcDayStart(gte)).toBe(true);
    }
    expect(cancelled.some((w) => isUtcMonthStart(gteOf(w)!))).toBe(true);
  });

  it("reports them separately from the all-time cancelled total", async () => {
    mockedRepo.countOrdersByStatus.mockResolvedValue(
      new Map([["CANCELLED", 900]]),
    );
    // Routed by call order, not by the date: on the first of the month the day
    // and month boundaries are the same instant, and a test that told them
    // apart by value would pass for 30 days and fail on the 31st.
    const cancelledCalls: number[] = [4, 30];
    let seen = 0;
    mockedRepo.countOrders.mockImplementation(async (where) => {
      const w = where as Record<string, unknown>;
      if (w.status !== "CANCELLED") return 0;
      return cancelledCalls[seen++] ?? 0;
    });

    const overview = await dashboardService.getOverview();

    // Three different questions, three different numbers. The failure this
    // catches is a daily counter quietly reading the all-time total.
    expect(overview.counters.cancelledOrders).toBe(900);
    expect(overview.counters.cancelledOrdersToday).toBe(4);
    expect(overview.counters.cancelledOrdersThisMonth).toBe(30);
  });
});

describe("the restaurant counters the map names", () => {
  /** A window deliberately nowhere near today. */
  const farWindow = {
    granularity: "day" as const,
    from: "2020-01-05T00:00:00.000Z",
    to: "2020-02-05T00:00:00.000Z",
  };

  it("fixes the day and month counters instead of following the query window", async () => {
    await dashboardService.getRestaurantReport("rest_1", farWindow);

    // Exactly one counter may move with `from`/`to` — `ordersInRange`. If a
    // second one did, "today" would mean whatever the caller asked for.
    const windowed = wheres().filter(
      (w) => gteOf(w)?.getUTCFullYear() === 2020,
    );
    expect(windowed).toHaveLength(1);
  });

  it("counts today's not-delivered orders, excluding cancelled ones too", async () => {
    await dashboardService.getRestaurantReport("rest_1", query);

    const notDelivered = wheres().filter((w) => isNotIn(w.status));
    expect(notDelivered).toHaveLength(1);
    // The judgement call, pinned. The map lists cancelled orders as their own
    // counter next to this one, so an order that was called off is not an
    // order still owed to anybody — the two are a partition, not overlapping
    // sets.
    expect((notDelivered[0]!.status as { notIn: string[] }).notIn).toEqual([
      "DELIVERED",
      "CANCELLED",
    ]);
    expect(isUtcDayStart(gteOf(notDelivered[0]!)!)).toBe(true);
  });

  it("routes each counter to its own response field", async () => {
    // One distinct number per call, in the order the service issues them, so
    // any pair swapped in the destructuring shows up as two wrong fields —
    // the failure mode of assembling seven counters from one Promise.all.
    const byCallOrder = [500, 99, 20, 60, 3, 12, 7];
    let seen = 0;
    mockedRepo.countOrders.mockImplementation(
      async () => byCallOrder[seen++] ?? -1,
    );

    const report = await dashboardService.getRestaurantReport(
      "rest_1",
      farWindow,
    );

    expect(report.counters).toMatchObject({
      orders: 500,
      ordersInRange: 99,
      ordersToday: 20,
      ordersThisMonth: 60,
      cancelledOrdersToday: 3,
      cancelledOrdersThisMonth: 12,
      notDeliveredToday: 7,
    });
  });
});
