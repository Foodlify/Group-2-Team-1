import type { PrismaClient } from "../../generated/prisma/client";
import { BaseRepository } from "../../shared/repositories/base.repository";
import prisma from "../../config/prisma";

export class AddressRepository extends BaseRepository<PrismaClient["address"]> {
  constructor() {
    super(prisma.address);
  }

  async findById(id: string) {
    return this.findUnique({ where: { id } });
  }

  async findByCustomerId(customerId: string) {
    return prisma.address.findMany({
      where: { customerId },
      orderBy: { createdAt: "asc" },
    });
  }

  async countByCustomerId(customerId: string) {
    return this.count({ where: { customerId } });
  }

  async setDefault(customerId: string, addressId: string) {
    return this.transaction(async (tx) => {
      await tx.address.updateMany({
        where: { customerId, isDefault: true, NOT: { id: addressId } },
        data: { isDefault: false },
      });
      return tx.address.update({
        where: { id: addressId },
        data: { isDefault: true },
      });
    });
  }

  async deleteAndReassignDefault(
    customerId: string,
    addressId: string,
    wasDefault: boolean,
  ) {
    await this.transaction(async (tx) => {
      await tx.address.delete({ where: { id: addressId } });
      if (!wasDefault) return;
      const newest = await tx.address.findFirst({
        where: { customerId },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (newest) {
        await tx.address.update({
          where: { id: newest.id },
          data: { isDefault: true },
        });
      }
    });
  }
}

export const addressRepository = new AddressRepository();
