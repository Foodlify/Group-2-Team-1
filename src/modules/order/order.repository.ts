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

  /** Distinct restaurants the customer has ever ordered from. */
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

  /**
   * Atomically appends an entry to `timeline` and mirrors its status onto
   * the `status` scalar in a single UPDATE — no read-modify-write race, no
   * lost-update under concurrent callers (Postgres jsonb || is atomic).
   *
   * Pass `expectedStatus` to enforce the update only succeeds when the order
   * is currently in that state, eliminating an extra read roundtrip.
   * Returns `null` when no row matched (e.g. status precondition failed).
   */
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
    // Tagged-template `$queryRaw` (not the `Unsafe` variant): every interpolated
    // value is a bound parameter, and the optional precondition is composed with
    // `Prisma.sql`/`Prisma.empty` rather than string concatenation.
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

  /** Admin: paginated list across all customers, same optional filters. */
  async findPaginatedAll(options: {
    page: number;
    limit: number;
    from?: Date;
    to?: Date;
    status?: OrderStatus;
  }) {
    return this.findPaginatedWhere(
      this.buildOrderFilter(options),
      options.page,
      options.limit,
    );
  }

  private buildOrderFilter(
    options: { from?: Date; to?: Date; status?: OrderStatus },
    customerId?: string,
  ): Prisma.OrderWhereInput {
    const where: Prisma.OrderWhereInput = {};
    if (customerId) where.customerId = customerId;
    if (options.status) where.status = options.status;
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
