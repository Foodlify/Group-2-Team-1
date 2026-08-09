import { Prisma } from "../../generated/prisma/client";
import prisma from "../../config/prisma";
import { DATE_TRUNC_UNIT, type ReportGranularity } from "./dashboard.model";
import type { TransactionBucketRow } from "./dashboard.model";

/**
 * Read-only aggregation for the dashboard.
 *
 * Nothing here loads rows into JavaScript to count or add them up — every
 * total is computed by PostgreSQL. That is not only about speed: summing money
 * in JS means summing `number`, and the order module already had to be fixed
 * once for exactly that (`8.15 x 3` came out as `24.450000000000003`). Prisma
 * returns `_sum` over a `Decimal` column as a `Decimal`, so the exactness
 * survives all the way to the response boundary.
 *
 * Does not extend `BaseRepository`: that base exists for CRUD over one model,
 * and this reads across four of them without writing to any.
 */
export class DashboardRepository {
  // ─── Counters ─────────────────────────────────────────────

  /**
   * Restaurants a customer could actually order from. Soft-deleted rows are
   * excluded, or the dashboard reports a catalog bigger than the one being
   * served.
   */
  async countRestaurants(): Promise<number> {
    return prisma.restaurant.count({ where: { isDeleted: false } });
  }

  /**
   * Customers, split by whether their account is usable. `isActive` lives on
   * `User`, so a disabled account still has its Customer row — counting those
   * as active would overstate the customer base.
   */
  async countCustomers(): Promise<{ total: number; active: number }> {
    const [total, active] = await Promise.all([
      prisma.customer.count(),
      prisma.customer.count({ where: { user: { isActive: true } } }),
    ]);
    return { total, active };
  }

  /** Orders matching a filter — used for every order counter. */
  async countOrders(where: Prisma.OrderWhereInput): Promise<number> {
    return prisma.order.count({ where });
  }

  /** Transactions matching a filter, regardless of status. */
  async countTransactions(
    where: Prisma.TransactionWhereInput,
  ): Promise<number> {
    return prisma.transaction.count({ where });
  }

  // ─── Money ────────────────────────────────────────────────

  /**
   * Sums transaction amounts by type, in SQL.
   *
   * Scoped to `SUCCESS` by every caller: a `PENDING` card payment is a
   * customer who has been shown a checkout page, not money in the account, and
   * a `FAILED` refund is money that never left. Reporting either as revenue
   * would be inventing it.
   */
  async sumByType(
    where: Prisma.TransactionWhereInput,
  ): Promise<Map<string, Prisma.Decimal>> {
    const grouped = await prisma.transaction.groupBy({
      by: ["type"],
      where,
      _sum: { amount: true },
    });
    return new Map(
      grouped.map((row) => [
        row.type,
        row._sum.amount ?? new Prisma.Decimal(0),
      ]),
    );
  }

  // ─── Time series ──────────────────────────────────────────

  /**
   * Successful transactions bucketed by day or month, split by type.
   *
   * Raw SQL because Prisma cannot express `date_trunc`, and doing it in JS
   * would mean pulling every transaction in the range across the wire to group
   * them here. The unit is looked up from a fixed table rather than
   * interpolated from the request, and every other value is a bound parameter.
   *
   * Buckets are **UTC**. `createdAt` is `timestamp(3)` without a zone, so
   * there is no zone information to convert from; a report for "today" in
   * Cairo is therefore shifted by the UTC offset. Documented rather than
   * silently wrong — see docs/DASHBOARD.md.
   */
  async transactionSeries(
    granularity: ReportGranularity,
    from: Date,
    to: Date,
    restaurantId?: string,
  ): Promise<TransactionBucketRow[]> {
    const unit = DATE_TRUNC_UNIT[granularity];

    const restaurantFilter = restaurantId
      ? Prisma.sql`AND o."restaurantId" = ${restaurantId}`
      : Prisma.empty;

    return prisma.$queryRaw<TransactionBucketRow[]>`
      SELECT date_trunc(${unit}, t."createdAt") AS bucket,
             t.type::text                       AS type,
             COUNT(*)::int                      AS count,
             SUM(t.amount)                      AS total
      FROM "Transaction" t
      LEFT JOIN "Order" o ON o.id = t."orderId"
      WHERE t.status = 'SUCCESS'
        AND t."createdAt" >= ${from}
        AND t."createdAt" < ${to}
        ${restaurantFilter}
      GROUP BY bucket, t.type
      ORDER BY bucket ASC
    `;
  }

  // ─── Order breakdowns ─────────────────────────────────────

  /** Order counts per status, in one query rather than one query per status. */
  async countOrdersByStatus(
    where: Prisma.OrderWhereInput,
  ): Promise<Map<string, number>> {
    const grouped = await prisma.order.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
    });
    return new Map(grouped.map((row) => [row.status, row._count._all]));
  }

  /** Exists and is not soft-deleted — the guard before any per-restaurant report. */
  async findRestaurant(
    restaurantId: string,
  ): Promise<{ id: string; name: string } | null> {
    return prisma.restaurant.findFirst({
      where: { id: restaurantId, isDeleted: false },
      select: { id: true, name: true },
    });
  }
}

export const dashboardRepository = new DashboardRepository();
