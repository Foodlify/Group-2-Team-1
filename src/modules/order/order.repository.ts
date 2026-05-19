import type { PrismaClient, Prisma } from "../../generated/prisma/client";
import { BaseRepository } from "../../shared/repositories/base.repository";
import prisma from "../../config/prisma";
import { parseTimeline, type TimelineEntry } from "./order.model";

export class OrderRepository extends BaseRepository<PrismaClient["order"]> {
  constructor() {
    super(prisma.order);
  }

  async findById(id: string) {
    return this.findUnique({ where: { id } });
  }

  async findByCustomerId(customerId: string, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).order.findMany({ where: { customerId }, orderBy: { createdAt: "desc" } });
  }

  async createOrder(
    data: { customerId: string; addressId: string },
    tx?: Prisma.TransactionClient,
  ) {
    const initial: TimelineEntry = {
      status: "PENDING",
      changedAt: new Date().toISOString(),
    };
    return (tx ?? prisma).order.create({
      data: {
        ...data,
        status: "PENDING",
        timeline: [initial] as unknown as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Atomically appends an entry to `timeline` and mirrors its status onto
   * the `status` scalar in a single UPDATE — no read-modify-write race, no
   * lost-update under concurrent callers (Postgres jsonb || is atomic).
   */
  async appendTimelineEntry(
    id: string,
    entry: TimelineEntry,
    tx?: Prisma.TransactionClient,
  ): Promise<{ status: string; timeline: TimelineEntry[]; updatedAt: Date }> {
    const client = tx ?? prisma;
    const rows = await client.$queryRaw<
      Array<{ status: string; timeline: unknown; updatedAt: Date }>
    >`
      UPDATE "Order"
      SET timeline = timeline || ${JSON.stringify([entry])}::jsonb,
          status = ${entry.status},
          "updatedAt" = NOW()
      WHERE id = ${id}
      RETURNING status, timeline, "updatedAt"
    `;
    const row = rows[0];
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
    options: { page: number; limit: number; from?: Date; to?: Date },
  ) {
    const { page, limit, from, to } = options;
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = { customerId };
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
