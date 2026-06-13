import type { PrismaClient, Prisma } from "../../generated/prisma/client";
import { BaseRepository } from "../../shared/repositories/base.repository";
import prisma from "../../config/prisma";

export class OrderItemRepository extends BaseRepository<PrismaClient["orderItems"]> {
  constructor() {
    super(prisma.orderItems);
  }

  async findById(id: string) {
    return this.findUnique({ where: { id } });
  }

  async createManyWithTx(
    items: Array<{
      id?: string;
      orderId: string;
      menuItemId: string;
      quantity: number;
      price: number;
      name: string;
    }>,
    tx: Prisma.TransactionClient,
  ) {
    return tx.orderItems.createManyAndReturn({ data: items });
  }
  async findManyByOrderIdWithTx(
    orderId: string,
    tx: Prisma.TransactionClient,
  ) {
    return tx.orderItems.findMany({
      where: { orderId },
      orderBy: { createdAt: "asc" },
    });
  }
}

export const orderItemRepository = new OrderItemRepository();
