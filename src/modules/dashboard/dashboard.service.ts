import { Prisma } from "../../generated/prisma/client";
import { appError } from "../../middlewares/error.middleware";
import { catalogErrors } from "../../shared/exceptions/catalog.errors";
import { dashboardRepository } from "./dashboard.repository";
import type {
  MoneyTotals,
  ReportGranularity,
  TransactionBucketRow,
} from "./dashboard.model";
import type {
  OverviewResponse,
  ReportQuery,
  RestaurantReportResponse,
  TransactionReportResponse,
} from "./dashboard.validation";

/**
 * Transaction types that represent money leaving again. Kept as a set so the
 * arithmetic below cannot silently miss `PARTIAL_REFUND` the way a
 * `type === "REFUND"` check would.
 */
const REFUND_TYPES = new Set(["REFUND", "PARTIAL_REFUND"]);
const PAYMENT_TYPE = "ORDER_PAYMENT";

const ZERO = new Prisma.Decimal(0);

class DashboardService {
  // ─── System overview ──────────────────────────────────────

  async getOverview(): Promise<OverviewResponse> {
    const now = new Date();
    const dayStart = startOfUtcDay(now);
    const monthStart = startOfUtcMonth(now);

    const successfulPayments = { status: "SUCCESS" as const };

    const [
      restaurants,
      customers,
      ordersTotal,
      ordersToday,
      ordersThisMonth,
      ordersByStatus,
      transactionsTotal,
      totalsAllTime,
      totalsToday,
      totalsThisMonth,
    ] = await Promise.all([
      dashboardRepository.countRestaurants(),
      dashboardRepository.countCustomers(),
      dashboardRepository.countOrders({}),
      dashboardRepository.countOrders({ orderDate: { gte: dayStart } }),
      dashboardRepository.countOrders({ orderDate: { gte: monthStart } }),
      dashboardRepository.countOrdersByStatus({}),
      dashboardRepository.countTransactions({}),
      dashboardRepository.sumByType(successfulPayments),
      dashboardRepository.sumByType({
        ...successfulPayments,
        createdAt: { gte: dayStart },
      }),
      dashboardRepository.sumByType({
        ...successfulPayments,
        createdAt: { gte: monthStart },
      }),
    ]);

    return {
      generatedAt: now.toISOString(),
      timezone: "UTC",
      counters: {
        restaurants,
        customers: customers.total,
        activeCustomers: customers.active,
        orders: ordersTotal,
        ordersToday,
        ordersThisMonth,
        cancelledOrders: ordersByStatus.get("CANCELLED") ?? 0,
        deliveredOrders: ordersByStatus.get("DELIVERED") ?? 0,
        transactions: transactionsTotal,
      },
      ordersByStatus: Object.fromEntries(ordersByStatus),
      revenue: {
        allTime: toMoneyResponse(netTotals(totalsAllTime)),
        today: toMoneyResponse(netTotals(totalsToday)),
        thisMonth: toMoneyResponse(netTotals(totalsThisMonth)),
      },
    };
  }

  // ─── Transaction report ───────────────────────────────────

  async getTransactionReport(
    query: ReportQuery,
  ): Promise<TransactionReportResponse> {
    const { from, to } = resolveRange(query);
    const rows = await dashboardRepository.transactionSeries(
      query.granularity,
      from,
      to,
    );
    return this.buildReport(query.granularity, from, to, rows);
  }

  // ─── Per-restaurant report ────────────────────────────────

  async getRestaurantReport(
    restaurantId: string,
    query: ReportQuery,
  ): Promise<RestaurantReportResponse> {
    const restaurant = await dashboardRepository.findRestaurant(restaurantId);
    if (!restaurant) throw appError(catalogErrors.RESTAURANT_NOT_FOUND);

    const { from, to } = resolveRange(query);
    const scoped = { restaurantId };

    const [ordersTotal, ordersInRange, ordersByStatus, totals, rows] =
      await Promise.all([
        dashboardRepository.countOrders(scoped),
        dashboardRepository.countOrders({
          ...scoped,
          orderDate: { gte: from, lt: to },
        }),
        dashboardRepository.countOrdersByStatus(scoped),
        // Transactions belong to orders, so a restaurant's money is reached
        // through the order relation rather than stored on the transaction.
        dashboardRepository.sumByType({
          status: "SUCCESS",
          order: { restaurantId },
        }),
        dashboardRepository.transactionSeries(
          query.granularity,
          from,
          to,
          restaurantId,
        ),
      ]);

    return {
      restaurantId: restaurant.id,
      name: restaurant.name,
      counters: {
        orders: ordersTotal,
        ordersInRange,
        cancelledOrders: ordersByStatus.get("CANCELLED") ?? 0,
        deliveredOrders: ordersByStatus.get("DELIVERED") ?? 0,
      },
      ordersByStatus: Object.fromEntries(ordersByStatus),
      revenueAllTime: toMoneyResponse(netTotals(totals)),
      report: this.buildReport(query.granularity, from, to, rows),
    };
  }

  // ─── Shared assembly ──────────────────────────────────────

  /**
   * Folds the raw per-(bucket, type) rows into one entry per bucket, with
   * refunds subtracted from payments.
   *
   * Adding every transaction together would report a busy refund day as a
   * record month — the refund rows carry positive amounts, because the ledger
   * records what moved, not which direction.
   */
  private buildReport(
    granularity: ReportGranularity,
    from: Date,
    to: Date,
    rows: TransactionBucketRow[],
  ): TransactionReportResponse {
    const buckets = new Map<
      string,
      { payments: Prisma.Decimal; refunds: Prisma.Decimal; count: number }
    >();

    for (const row of rows) {
      const key = row.bucket.toISOString();
      const entry = buckets.get(key) ?? {
        payments: ZERO,
        refunds: ZERO,
        count: 0,
      };
      const amount = row.total ?? ZERO;

      if (row.type === PAYMENT_TYPE) {
        entry.payments = entry.payments.plus(amount);
      } else if (REFUND_TYPES.has(row.type)) {
        entry.refunds = entry.refunds.plus(amount);
      }
      entry.count += row.count;
      buckets.set(key, entry);
    }

    const series = [...buckets.entries()].map(([period, entry]) => ({
      period,
      transactions: entry.count,
      ...toMoneyResponse({
        payments: entry.payments,
        refunds: entry.refunds,
        net: entry.payments.minus(entry.refunds),
      }),
    }));

    // Totals are re-summed from the buckets rather than queried again, so the
    // header can never disagree with the rows underneath it.
    const totals = series.reduce<MoneyTotals>(
      (acc, row) => ({
        payments: acc.payments.plus(row.payments),
        refunds: acc.refunds.plus(row.refunds),
        net: acc.net.plus(row.net),
      }),
      { payments: ZERO, refunds: ZERO, net: ZERO },
    );

    return {
      granularity,
      from: from.toISOString(),
      to: to.toISOString(),
      timezone: "UTC",
      currency: "EGP",
      transactions: series.reduce((sum, row) => sum + row.transactions, 0),
      totals: toMoneyResponse(totals),
      series,
    };
  }
}

// ─── Helpers ────────────────────────────────────────────────

/** Payments minus refunds, all still exact. */
const netTotals = (sums: Map<string, Prisma.Decimal>): MoneyTotals => {
  const payments = sums.get(PAYMENT_TYPE) ?? ZERO;
  const refunds = [...sums.entries()]
    .filter(([type]) => REFUND_TYPES.has(type))
    .reduce((acc, [, amount]) => acc.plus(amount), ZERO);
  return { payments, refunds, net: payments.minus(refunds) };
};

/**
 * The single place Decimal becomes `number`, at the JSON boundary — matching
 * how the order and cart responses already do it.
 */
const toMoneyResponse = (
  totals: MoneyTotals,
): { payments: number; refunds: number; net: number } => ({
  payments: totals.payments.toNumber(),
  refunds: totals.refunds.toNumber(),
  net: totals.net.toNumber(),
});

const startOfUtcDay = (now: Date): Date =>
  new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      0,
      0,
      0,
    ),
  );

const startOfUtcMonth = (now: Date): Date =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));

/**
 * Resolves the reporting window. `to` is treated as **exclusive** so adjacent
 * ranges never double-count the transaction that lands exactly on the
 * boundary. Defaults to the last 30 days ending now.
 */
const resolveRange = (query: ReportQuery): { from: Date; to: Date } => {
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from
    ? new Date(query.from)
    : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from, to };
};

export const dashboardService = new DashboardService();
