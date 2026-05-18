import type { PrismaClient, Prisma } from "../../generated/prisma/client";
import { BaseRepository } from "../../shared/repositories/base.repository";
import prisma from "../../config/prisma";
import type { TimelineEntry } from "./order.model";
import type { OrderStatusValue } from "./order.status";

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

  /**
   * Creates a new order with its initial PENDING entry in `timeline`. The
   * scalar `status` mirrors the latest timeline entry for indexed queries.
   */
  async createOrder(
    data: { customerId: string; addressId: string },
    tx?: Prisma.TransactionClient,
    changedBy?: string,
  ) {
    const initial: TimelineEntry = {
      status: "PENDING",
      changedAt: new Date().toISOString(),
      ...(changedBy ? { changedBy } : {}),
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
   * Atomically appends a new entry to `timeline` and (when the entry carries
   * a new status) updates the scalar `status` mirror. Must be wrapped in a
   * transaction by the caller since it issues a read followed by a write
   * against the same row.
   */
  async appendTimelineEntry(
    id: string,
    entry: TimelineEntry,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? prisma;
    const current = await client.order.findUnique({ where: { id } });
    const existing = (current?.timeline as unknown as TimelineEntry[]) ?? [];
    const timeline = [...existing, entry];
    return client.order.update({
      where: { id },
      data: {
        status: entry.status as OrderStatusValue,
        timeline: timeline as unknown as Prisma.InputJsonValue,
      },
    });
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
