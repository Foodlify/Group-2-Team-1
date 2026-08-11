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
    return this.findUnique({ where: { id } });
  }

  async findByUserId(userId: string) {
    return this.findUnique({ where: { userId } });
  }

  async findContactById(id: string) {
    return prisma.customer.findUnique({
      where: { id },
      select: { user: { select: { name: true, email: true } } },
    });
  }

  async findByUserIdWithDetails(userId: string) {
    return prisma.customer.findUnique({
      where: { userId },
      include: {
        user: { select: { name: true, email: true } },
        cart: { select: { id: true } },
        _count: { select: { addresses: true, orders: true } },
      },
    });
  }

  async updateProfile(params: {
    customerId: string;
    userId: string;
    name?: string;
    phone?: string;
  }) {
    return prisma.$transaction(async (tx) => {
      if (params.name !== undefined) {
        await tx.user.update({
          where: { id: params.userId },
          data: { name: params.name },
        });
      }
      if (params.phone !== undefined) {
        await tx.customer.update({
          where: { id: params.customerId },
          data: { phone: params.phone },
        });
      }
    });
  }
}

export const customerRepository = new CustomerRepository();
