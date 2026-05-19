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

  async findByIdWithOrders(id: string) {
    return this.delegate.findUnique({
      where: { id },
      include: {
        orders: {
          include: {
            items: { include: { menuItem: true } },
            address: true,
            status: true,
          },
          orderBy: { orderDate: "desc" },
        },
      },
    });
  }
  async findCustomerOrderHistory(id: string) {
    return this.delegate.findUnique({
      where: { id },
      include: {
        orders: {
          omit: { customerId: true, addressId: true },
          include: {
            items: { include: { menuItem: true } },
            status: true,
          },
          orderBy: { orderDate: "desc" },
        },
      },
    });
  }
}

export const customerRepository = new CustomerRepository();
