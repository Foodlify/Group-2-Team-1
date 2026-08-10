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

describe("refunds are subtracted from revenue, never added", () => {
  it("nets a refund off the payments in the same bucket", async () => {
    mockedRepo.transactionSeries.mockResolvedValue([
      bucket("2026-08-01T00:00:00.000Z", "ORDER_PAYMENT", "500.00", 5),
      bucket("2026-08-01T00:00:00.000Z", "REFUND", "120.00", 1),
    ]);

    const report = await dashboardService.getTransactionReport(query);

    expect(report.series[0]!.payments).toBe(500);
    expect(report.series[0]!.refunds).toBe(120);

    expect(report.series[0]!.net).toBe(380);
  });

  it("counts PARTIAL_REFUND as a refund too", async () => {
    mockedRepo.transactionSeries.mockResolvedValue([
      bucket("2026-08-01T00:00:00.000Z", "ORDER_PAYMENT", "100.00"),
      bucket("2026-08-01T00:00:00.000Z", "PARTIAL_REFUND", "30.00"),
    ]);

    const report = await dashboardService.getTransactionReport(query);

    expect(report.series[0]!.refunds).toBe(30);
    expect(report.series[0]!.net).toBe(70);
  });

  it("reports a net loss rather than clamping it at zero", async () => {
    mockedRepo.transactionSeries.mockResolvedValue([
      bucket("2026-08-02T00:00:00.000Z", "ORDER_PAYMENT", "50.00"),
      bucket("2026-08-02T00:00:00.000Z", "REFUND", "200.00"),
    ]);

    const report = await dashboardService.getTransactionReport(query);

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

describe("money is exact", () => {
  it("sums prices that float arithmetic gets wrong", async () => {
    mockedRepo.transactionSeries.mockResolvedValue([
      bucket("2026-08-01T00:00:00.000Z", "ORDER_PAYMENT", "24.45"),
      bucket("2026-08-02T00:00:00.000Z", "ORDER_PAYMENT", "209.93"),
    ]);

    const report = await dashboardService.getTransactionReport(query);

    expect(report.totals.payments).toBe(234.38);
  });

  it("keeps a long series drift-free", async () => {
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

    expect(report.series[0]!.net).toBe(0.2);
  });
});

describe("only settled money is reported", () => {
  it("asks the database for SUCCESS transactions only", async () => {
    await dashboardService.getOverview();

    for (const [where] of mockedRepo.sumByType.mock.calls) {
      expect(where).toMatchObject({ status: "SUCCESS" });
    }
  });

  it("scopes a restaurant's revenue through its orders", async () => {
    await dashboardService.getRestaurantReport("rest_1", query);

    expect(mockedRepo.sumByType).toHaveBeenCalledWith({
      status: "SUCCESS",
      order: { restaurantId: "rest_1" },
    });
  });
});

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

    expect(report.from).toBe("2026-05-01T00:00:00.000Z");
    expect(report.to).toBe("2026-05-08T00:00:00.000Z");
    expect(report.granularity).toBe("day");
  });
});

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

    expect(overview.counters.cancelledOrders).toBe(0);
    expect(overview.counters.deliveredOrders).toBe(0);
  });

  it("counts today's and this month's orders from UTC boundaries", async () => {
    await dashboardService.getOverview();

    const windows = mockedRepo.countOrders.mock.calls
      .map(([where]) => (where as { orderDate?: { gte: Date } }).orderDate?.gte)
      .filter((d): d is Date => d instanceof Date);

    expect(windows.length).toBeGreaterThanOrEqual(2);
    for (const start of windows) {
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

const wheres = () =>
  mockedRepo.countOrders.mock.calls.map(
    ([where]) => where as Record<string, unknown>,
  );

const isUtcDayStart = (d: Date): boolean =>
  d.getUTCHours() === 0 &&
  d.getUTCMinutes() === 0 &&
  d.getUTCSeconds() === 0 &&
  d.getUTCMilliseconds() === 0;

const isUtcMonthStart = (d: Date): boolean =>
  isUtcDayStart(d) && d.getUTCDate() === 1;

const gteOf = (w: Record<string, unknown>): Date | undefined =>
  (w.orderDate as { gte?: Date } | undefined)?.gte;

const isNotIn = (status: unknown): status is { notIn: string[] } =>
  typeof status === "object" && status !== null && "notIn" in status;

describe("Daily / Monthly Cancelled Orders — system overview", () => {
  it("asks over exactly two windows, both UTC boundaries, one a month start", async () => {
    await dashboardService.getOverview();

    const cancelled = wheres().filter((w) => w.status === "CANCELLED");
    expect(cancelled).toHaveLength(2);
    for (const w of cancelled) {
      const gte = gteOf(w);

      expect(gte && isUtcDayStart(gte)).toBe(true);
    }
    expect(cancelled.some((w) => isUtcMonthStart(gteOf(w)!))).toBe(true);
  });

  it("reports them separately from the all-time cancelled total", async () => {
    mockedRepo.countOrdersByStatus.mockResolvedValue(
      new Map([["CANCELLED", 900]]),
    );

    const cancelledCalls: number[] = [4, 30];
    let seen = 0;
    mockedRepo.countOrders.mockImplementation(async (where) => {
      const w = where as Record<string, unknown>;
      if (w.status !== "CANCELLED") return 0;
      return cancelledCalls[seen++] ?? 0;
    });

    const overview = await dashboardService.getOverview();

    expect(overview.counters.cancelledOrders).toBe(900);
    expect(overview.counters.cancelledOrdersToday).toBe(4);
    expect(overview.counters.cancelledOrdersThisMonth).toBe(30);
  });
});

describe("the restaurant counters the map names", () => {
  const farWindow = {
    granularity: "day" as const,
    from: "2020-01-05T00:00:00.000Z",
    to: "2020-02-05T00:00:00.000Z",
  };

  it("fixes the day and month counters instead of following the query window", async () => {
    await dashboardService.getRestaurantReport("rest_1", farWindow);

    const windowed = wheres().filter(
      (w) => gteOf(w)?.getUTCFullYear() === 2020,
    );
    expect(windowed).toHaveLength(1);
  });

  it("counts today's not-delivered orders, excluding cancelled ones too", async () => {
    await dashboardService.getRestaurantReport("rest_1", query);

    const notDelivered = wheres().filter((w) => isNotIn(w.status));
    expect(notDelivered).toHaveLength(1);

    expect((notDelivered[0]!.status as { notIn: string[] }).notIn).toEqual([
      "DELIVERED",
      "CANCELLED",
    ]);
    expect(isUtcDayStart(gteOf(notDelivered[0]!)!)).toBe(true);
  });

  it("routes each counter to its own response field", async () => {
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
