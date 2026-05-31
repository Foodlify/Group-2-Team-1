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
}

export const addressRepository = new AddressRepository();
