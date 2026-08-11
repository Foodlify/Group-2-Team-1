import { Prisma, type PrismaClient } from "../../generated/prisma/client";
import { BaseRepository } from "../../shared/repositories/base.repository";
import prisma from "../../config/prisma";
import { OrderStatus } from "./order.status";
import { parseTimeline, type TimelineEntry } from "./order.model";

export class OrderRepository extends BaseRepository<PrismaClient["order"]> {
  constructor() {
    super(prisma.order);
  }

  async findById(id: string, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).order.findUnique({ where: { id } });
  }

  async findByCustomerId(customerId: string, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).order.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
    });
  }

  async distinctRestaurantIdsForCustomer(
    customerId: string,
  ): Promise<string[]> {
    const rows = await prisma.order.findMany({
      where: { customerId },
      select: { restaurantId: true },
      distinct: ["restaurantId"],
    });
    return rows.map((r) => r.restaurantId);
  }

  async createOrder(
    data: {
      customerId: string;
      addressId: string;
      totalAmount: Prisma.Decimal | number;
      restaurantId: string;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const initial: TimelineEntry = {
      status: OrderStatus.PENDING,
      changedAt: new Date().toISOString(),
    };
    return (tx ?? prisma).order.create({
      data: {
        ...data,
        status: OrderStatus.PENDING,
        timeline: [initial] as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async appendTimelineEntry(
    id: string,
    entry: TimelineEntry,
    expectedStatus?: string,
    tx?: Prisma.TransactionClient,
  ): Promise<{
    status: string;
    timeline: TimelineEntry[];
    updatedAt: Date;
  } | null> {
    const client = tx ?? prisma;

    const statusPrecondition = expectedStatus
      ? Prisma.sql`AND status = ${expectedStatus}::"OrderStatus"`
      : Prisma.empty;
    const rows = await client.$queryRaw<
      Array<{ status: string; timeline: unknown; updatedAt: Date }>
    >(Prisma.sql`
      UPDATE "Order"
      SET timeline = timeline || ${JSON.stringify([entry])}::jsonb,
          status = ${entry.status}::"OrderStatus",
          "updatedAt" = NOW()
      WHERE id = ${id} ${statusPrecondition}
      RETURNING status, timeline, "updatedAt"
    `);
    const row = rows[0];
    if (!row) return null;
    return {
      status: row.status,
      timeline: parseTimeline(row.timeline),
      updatedAt: row.updatedAt,
    };
  }

  async findByIdWithDetails(id: string) {
    return prisma.order.findUnique({
      where: { id },
      include: {
        orderItems: { orderBy: { createdAt: "asc" } },
      },
    });
  }

  async findPaginatedByCustomer(
    customerId: string,
    options: {
      page: number;
      limit: number;
      from?: Date;
      to?: Date;
      status?: OrderStatus;
    },
  ) {
    return this.findPaginatedWhere(
      this.buildOrderFilter(options, customerId),
      options.page,
      options.limit,
    );
  }

  async findPaginatedAll(options: {
    page: number;
    limit: number;
    from?: Date;
    to?: Date;
    status?: OrderStatus;
    restaurantIds?: string[];
  }) {
    return this.findPaginatedWhere(
      this.buildOrderFilter(options),
      options.page,
      options.limit,
    );
  }

  private buildOrderFilter(
    options: {
      from?: Date;
      to?: Date;
      status?: OrderStatus;
      restaurantIds?: string[];
    },
    customerId?: string,
  ): Prisma.OrderWhereInput {
    const where: Prisma.OrderWhereInput = {};
    if (customerId) where.customerId = customerId;
    if (options.status) where.status = options.status;

    if (options.restaurantIds !== undefined) {
      where.restaurantId = { in: options.restaurantIds };
    }
    if (options.from || options.to) {
      where.createdAt = {};
      if (options.from) where.createdAt.gte = options.from;
      if (options.to) where.createdAt.lte = options.to;
    }
    return where;
  }

  private async findPaginatedWhere(
    where: Prisma.OrderWhereInput,
    page: number,
    limit: number,
  ) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: { orderItems: true },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.order.count({ where }),
    ]);
    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
}

export const orderRepository = new OrderRepository();
