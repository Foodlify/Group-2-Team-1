import { Prisma } from "../../generated/prisma/client";
import prisma from "../../config/prisma";
import { DATE_TRUNC_UNIT, type ReportGranularity } from "./dashboard.model";
import type { TransactionBucketRow } from "./dashboard.model";

export class DashboardRepository {
  async countRestaurants(): Promise<number> {
    return prisma.restaurant.count({ where: { isDeleted: false } });
  }

  async countCustomers(): Promise<{ total: number; active: number }> {
    const [total, active] = await Promise.all([
      prisma.customer.count(),
      prisma.customer.count({ where: { user: { isActive: true } } }),
    ]);
    return { total, active };
  }

  async countOrders(where: Prisma.OrderWhereInput): Promise<number> {
    return prisma.order.count({ where });
  }

  async countTransactions(
    where: Prisma.TransactionWhereInput,
  ): Promise<number> {
    return prisma.transaction.count({ where });
  }

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
