import type { PrismaClient, Prisma } from "../../generated/prisma/client";
import { BaseRepository } from "../../shared/repositories/base.repository";
import prisma from "../../config/prisma";

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
    return (tx ?? prisma).order.create({ data });
  }

  async findByIdWithDetails(id: string) {
    return prisma.order.findUnique({
      where: { id },
      include: {
        orderItems: { orderBy: { createdAt: "asc" } },
        orderStatus: true,
        orderTrackings: { orderBy: { createdAt: "desc" } },
      },
    });
  }

  async findPaginatedByCustomer(customerId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      prisma.order.findMany({
        where: { customerId },
        include: { orderItems: true, orderStatus: true },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.order.count({ where: { customerId } }),
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
