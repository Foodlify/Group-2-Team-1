import type { PrismaClient, Prisma } from "../../generated/prisma/client";
import { BaseRepository } from "../../shared/repositories/base.repository";
import prisma from "../../config/prisma";

export class OrderStatusRepository extends BaseRepository<PrismaClient["orderStatus"]> {
  constructor() {
    super(prisma.orderStatus);
  }

  async findByOrderId(orderId: string) {
    return this.findUnique({ where: { orderId } });
  }

  async createStatus(orderId: string, status: string, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).orderStatus.create({ data: { orderId, status } });
  }

  async updateStatus(orderId: string, status: string, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).orderStatus.update({ where: { orderId }, data: { status } });
  }
}

export const orderStatusRepository = new OrderStatusRepository();
