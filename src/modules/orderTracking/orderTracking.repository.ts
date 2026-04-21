import type { PrismaClient } from "../../generated/prisma/client";
import { BaseRepository } from "../../shared/repositories/base.repository";
import prisma from "../../config/prisma";

export class OrderTrackingRepository extends BaseRepository<PrismaClient["orderTracking"]> {
  constructor() {
    super(prisma.orderTracking);
  }

  /**
   * Convenience method — find by primary key id.
   * Entity-specific query methods should be added here as the application grows.
   */
  async findById(id: string) {
    return this.findUnique({ where: { id } });
  }
}

export const orderTrackingRepository = new OrderTrackingRepository();
