import type { PrismaClient } from "../../generated/prisma/client";
import { BaseRepository } from "../../shared/repositories/base.repository";
import prisma from "../../config/prisma";

export class CustomerRepository extends BaseRepository<
  PrismaClient["customer"]
> {
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

  /** Just enough to address an email to the customer. */
  async findContactById(id: string) {
    return prisma.customer.findUnique({
      where: { id },
      select: { user: { select: { name: true, email: true } } },
    });
  }

  /** Customer with linked user, cart presence, and address/order counts. */
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

  /**
   * Updates the customer's phone and/or the linked user's name in one
   * transaction (name lives on User, phone on Customer).
   */
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
