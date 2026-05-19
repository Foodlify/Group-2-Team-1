import type { PrismaClient } from "../../generated/prisma/client";
import { BaseRepository } from "../../shared/repositories/base.repository";
import prisma from "../../config/prisma";

export class OrderStatusRepository extends BaseRepository<PrismaClient["orderStatus"]> {
  constructor() {
    super(prisma.orderStatus);
  }

  /**
   * Convenience method — find by primary key orderId.
   * Entity-specific query methods should be added here as the application grows.
   */
  async findByOrderId(orderId: string) {
    return this.findUnique({ where: { orderId } });
  }
}

export const orderStatusRepository = new OrderStatusRepository();
