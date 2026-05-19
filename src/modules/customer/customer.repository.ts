import type { PrismaClient } from "../../generated/prisma/client";
import { BaseRepository } from "../../shared/repositories/base.repository";
import prisma from "../../config/prisma";

export class CustomerRepository extends BaseRepository<
  PrismaClient["customer"]
> {
  constructor() {
    super(prisma.customer);
  }

  async findById(id: string) {
    return this.findUnique({ where: { id }, include: { user: true } });
  }

  async findByUserId(userId: string) {
    return this.findUnique({ where: { userId }, include: { user: true } });
  }
}

export const customerRepository = new CustomerRepository();
