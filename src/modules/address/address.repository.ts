import type { PrismaClient } from "../../generated/prisma/client";
import { BaseRepository } from "../../shared/repositories/base.repository";
import prisma from "../../config/prisma";

export class AddressRepository extends BaseRepository<PrismaClient["address"]> {
  constructor() {
    super(prisma.address);
  }

  /**
   * Convenience method — find by primary key id.
   * Entity-specific query methods should be added here as the application grows.
   */
  async findById(id: string) {
    return this.findUnique({ where: { id } });
  }

  /** All addresses for a customer, oldest first. */
  async findByCustomerId(customerId: string) {
    return prisma.address.findMany({
      where: { customerId },
      orderBy: { createdAt: "asc" },
    });
  }

  /** Number of addresses the customer currently has. */
  async countByCustomerId(customerId: string) {
    return this.count({ where: { customerId } });
  }

  /**
   * Atomically re-points the customer's single default: clears the previous
   * flag and sets the new one in one transaction, so two rows can never both
   * read `isDefault: true`.
   */
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

  /**
   * Deletes an address and — when it was the default — promotes the newest
   * remaining address in the same transaction, so a customer who still owns
   * addresses is never left without a default.
   */
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
