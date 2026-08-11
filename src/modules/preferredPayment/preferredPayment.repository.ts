import type { PrismaClient } from "../../generated/prisma/client";
import { BaseRepository } from "../../shared/repositories/base.repository";
import prisma from "../../config/prisma";

export class PreferredPaymentRepository extends BaseRepository<
  PrismaClient["preferredPaymentSetting"]
> {
  constructor() {
    super(prisma.preferredPaymentSetting);
  }

  async findById(id: string) {
    return this.findUnique({ where: { id } });
  }

  async findByCustomerId(customerId: string) {
    return prisma.preferredPaymentSetting.findMany({
      where: { customerId },
      orderBy: { createdAt: "asc" },
    });
  }

  async countByCustomerId(customerId: string) {
    return this.count({ where: { customerId } });
  }

  async setDefault(customerId: string, settingId: string) {
    return this.transaction(async (tx) => {
      await tx.preferredPaymentSetting.updateMany({
        where: { customerId, isDefault: true, NOT: { id: settingId } },
        data: { isDefault: false },
      });
      return tx.preferredPaymentSetting.update({
        where: { id: settingId },
        data: { isDefault: true },
      });
    });
  }

  async deleteAndReassignDefault(
    customerId: string,
    settingId: string,
    wasDefault: boolean,
  ) {
    await this.transaction(async (tx) => {
      await tx.preferredPaymentSetting.delete({ where: { id: settingId } });
      if (!wasDefault) return;
      const newest = await tx.preferredPaymentSetting.findFirst({
        where: { customerId },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (newest) {
        await tx.preferredPaymentSetting.update({
          where: { id: newest.id },
          data: { isDefault: true },
        });
      }
    });
  }
}

export const preferredPaymentRepository = new PreferredPaymentRepository();
