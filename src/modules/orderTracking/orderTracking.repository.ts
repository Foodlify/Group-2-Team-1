import type { PrismaClient, Prisma } from "../../generated/prisma/client";
import { BaseRepository } from "../../shared/repositories/base.repository";
import prisma from "../../config/prisma";

export class OrderTrackingRepository extends BaseRepository<PrismaClient["orderTracking"]> {
  constructor() {
    super(prisma.orderTracking);
  }

  async findById(id: string) {
    return this.findUnique({ where: { id } });
  }

  async findByOrderId(orderId: string) {
    return prisma.orderTracking.findMany({
      where: { orderId },
      orderBy: { createdAt: "desc" },
    });
  }

  async createTracking(
    data: { orderId: string; currentLocation: string; estimatedDeliveryTime: Date },
    tx?: Prisma.TransactionClient,
  ) {
    return (tx ?? prisma).orderTracking.create({ data });
  }
}

export const orderTrackingRepository = new OrderTrackingRepository();
