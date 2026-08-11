import { Prisma } from "../../generated/prisma/client";
import { appError } from "../../middlewares/error.middleware";
import { catalogErrors } from "../../shared/exceptions/catalog.errors";
import { dashboardRepository } from "./dashboard.repository";
import type {
  MoneyTotals,
  ReportGranularity,
  TransactionBucketRow,
} from "./dashboard.model";
import { NOT_DELIVERED_STATUSES_EXCLUDED } from "./dashboard.model";
import type {
  OverviewResponse,
  ReportQuery,
  RestaurantReportResponse,
  TransactionReportResponse,
} from "./dashboard.validation";

const REFUND_TYPES = new Set(["REFUND", "PARTIAL_REFUND"]);
const PAYMENT_TYPE = "ORDER_PAYMENT";

const ZERO = new Prisma.Decimal(0);

class DashboardService {
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
      cancelledToday,
      cancelledThisMonth,
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

      dashboardRepository.countOrders({
        status: "CANCELLED",
        orderDate: { gte: dayStart },
      }),
      dashboardRepository.countOrders({
        status: "CANCELLED",
        orderDate: { gte: monthStart },
      }),
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
        cancelledOrdersToday: cancelledToday,
        cancelledOrdersThisMonth: cancelledThisMonth,
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

  async getRestaurantReport(
    restaurantId: string,
    query: ReportQuery,
  ): Promise<RestaurantReportResponse> {
    const restaurant = await dashboardRepository.findRestaurant(restaurantId);
    if (!restaurant) throw appError(catalogErrors.RESTAURANT_NOT_FOUND);

    const { from, to } = resolveRange(query);
    const scoped = { restaurantId };

    const now = new Date();
    const dayStart = startOfUtcDay(now);
    const monthStart = startOfUtcMonth(now);

    const [
      ordersTotal,
      ordersInRange,
      ordersByStatus,
      ordersToday,
      ordersThisMonth,
      cancelledToday,
      cancelledThisMonth,
      notDeliveredToday,
      totals,
      rows,
    ] = await Promise.all([
      dashboardRepository.countOrders(scoped),
      dashboardRepository.countOrders({
        ...scoped,
        orderDate: { gte: from, lt: to },
      }),
      dashboardRepository.countOrdersByStatus(scoped),

      dashboardRepository.countOrders({
        ...scoped,
        orderDate: { gte: dayStart },
      }),
      dashboardRepository.countOrders({
        ...scoped,
        orderDate: { gte: monthStart },
      }),
      dashboardRepository.countOrders({
        ...scoped,
        status: "CANCELLED",
        orderDate: { gte: dayStart },
      }),
      dashboardRepository.countOrders({
        ...scoped,
        status: "CANCELLED",
        orderDate: { gte: monthStart },
      }),
      dashboardRepository.countOrders({
        ...scoped,
        status: { notIn: [...NOT_DELIVERED_STATUSES_EXCLUDED] },
        orderDate: { gte: dayStart },
      }),

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
        ordersToday,
        ordersThisMonth,
        cancelledOrders: ordersByStatus.get("CANCELLED") ?? 0,
        cancelledOrdersToday: cancelledToday,
        cancelledOrdersThisMonth: cancelledThisMonth,
        notDeliveredToday,
        deliveredOrders: ordersByStatus.get("DELIVERED") ?? 0,
      },
      ordersByStatus: Object.fromEntries(ordersByStatus),
      revenueAllTime: toMoneyResponse(netTotals(totals)),
      report: this.buildReport(query.granularity, from, to, rows),
    };
  }

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

const netTotals = (sums: Map<string, Prisma.Decimal>): MoneyTotals => {
  const payments = sums.get(PAYMENT_TYPE) ?? ZERO;
  const refunds = [...sums.entries()]
    .filter(([type]) => REFUND_TYPES.has(type))
    .reduce((acc, [, amount]) => acc.plus(amount), ZERO);
  return { payments, refunds, net: payments.minus(refunds) };
};

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

const resolveRange = (query: ReportQuery): { from: Date; to: Date } => {
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from
    ? new Date(query.from)
    : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from, to };
};

export const dashboardService = new DashboardService();
