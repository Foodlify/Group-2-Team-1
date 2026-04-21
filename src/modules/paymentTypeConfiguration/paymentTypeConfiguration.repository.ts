import type { PrismaClient } from "../../generated/prisma/client";
import { BaseRepository } from "../../shared/repositories/base.repository";
import prisma from "../../config/prisma";

export class PaymentTypeConfigurationRepository extends BaseRepository<PrismaClient["paymentTypeConfiguration"]> {
  constructor() {
    super(prisma.paymentTypeConfiguration);
  }

  /**
   * Convenience method — find by primary key id.
   * Entity-specific query methods should be added here as the application grows.
   */
  async findById(id: string) {
    return this.findUnique({ where: { id } });
  }
}

export const paymentTypeConfigurationRepository = new PaymentTypeConfigurationRepository();
