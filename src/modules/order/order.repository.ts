import type { PrismaClient, Prisma } from "../../generated/prisma/client";
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
    return (tx ?? prisma).order.findMany({ where: { customerId }, orderBy: { createdAt: "desc" } });
  }

  async createOrder(
    data: {
      customerId: string;
      addressId: string;
      totalAmount: number;
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
  ): Promise<{ status: string; timeline: TimelineEntry[]; updatedAt: Date } | null> {
    const client = tx ?? prisma;
    const query = expectedStatus
      ? `UPDATE "Order" SET timeline = timeline || $1::jsonb, status = $2::"OrderStatus", "updatedAt" = NOW() WHERE id = $3 AND status = $4::"OrderStatus" RETURNING status, timeline, "updatedAt"`
      : `UPDATE "Order" SET timeline = timeline || $1::jsonb, status = $2::"OrderStatus", "updatedAt" = NOW() WHERE id = $3 RETURNING status, timeline, "updatedAt"`;
    const params = expectedStatus
      ? [JSON.stringify([entry]), entry.status, id, expectedStatus]
      : [JSON.stringify([entry]), entry.status, id];
    const rows = await client.$queryRawUnsafe<
      Array<{ status: string; timeline: unknown; updatedAt: Date }>
    >(query, ...params);
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
    const { page, limit, from, to, status } = options;
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = { customerId };
    if (status) where.status = status;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = from;
      if (to) where.createdAt.lte = to;
    }

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
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

export const orderRepository = new OrderRepository();
