import type { PrismaClient } from "../../generated/prisma/client";
import { BaseRepository } from "../../shared/repositories/base.repository";
import prisma from "../../config/prisma";

export class CustomerRepository extends BaseRepository<PrismaClient["customer"]> {
  constructor() {
    super(prisma.customer);
  }

  /**
   * Convenience method — find by primary key id.
   * Entity-specific query methods should be added here as the application grows.
   */
  async findById(id: string) {
    return this.findUnique({ where: { id } });
  }

  /** Resolves the customer linked to a user account (1:1 via userId). */
  async findByUserId(userId: string) {
    return this.findUnique({ where: { userId } });
  }
}

export const customerRepository = new CustomerRepository();
