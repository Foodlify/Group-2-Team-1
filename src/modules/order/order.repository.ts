import type { PrismaClient } from "../../generated/prisma/client";
import { BaseRepository } from "../../shared/repositories/base.repository";
import prisma from "../../config/prisma";
import type { OrderWithItems, OrderWithFullDetails } from "./order.model";

export class OrderRepository extends BaseRepository<PrismaClient["order"]> {
  constructor() {
    super(prisma.order);
  }

  async findByIdWithDetails(id: string): Promise<OrderWithFullDetails | null> {
    return this.delegate.findFirst({
      where: { id },
      include: {
        items: {
          include: {
            menuItem: true,
          },
        },
        address: true,
        status: true,
      },
    }) as Promise<OrderWithFullDetails | null>;
  }

  async createOrderWithItems(data: {
    customerId: string;
    addressId: string;
    items: { menuItemId: string; quantity: number }[];
  }): Promise<OrderWithItems> {
    return this.prisma.order.create({
      data: {
        customerId: data.customerId,
        addressId: data.addressId,
        items: {
          create: data.items,
        },
      },
      include: {
        items: {
          include: {
            menuItem: true,
          },
        },
        address: true,
      },
    }) as unknown as Promise<OrderWithItems>;
  }

  async findManyByCustomerIdWithDetails(customerId: string): Promise<OrderWithFullDetails[]> {
    return this.delegate.findMany({
      where: { customerId },
      include: {
        items: {
          include: {
            menuItem: true,
          },
        },
        address: true,
        status: true,
      },
      orderBy: {
        orderDate: "desc",
      },
    }) as Promise<OrderWithFullDetails[]>;
  }

  async updateOrder(id: string, data: { addressId?: string }): Promise<OrderWithFullDetails | null> {
    return this.delegate.update({
      where: { id },
      data: {
        ...(data.addressId && { addressId: data.addressId }),
      },
      include: {
        items: {
          include: {
            menuItem: true,
          },
        },
        address: true,
        status: true,
      },
    }) as unknown as Promise<OrderWithFullDetails | null>;
  }

  async cancelOrder(id: string): Promise<void> {
    await this.delegate.delete({
      where: { id },
    });
  }

  async findManyByRestaurantId(restaurantId: string): Promise<OrderWithFullDetails[]> {
    return this.delegate.findMany({
      where: {
        items: {
          some: {
            menuItem: {
              menu: {
                restaurantId,
              },
            },
          },
        },
      },
      include: {
        items: {
          include: {
            menuItem: {
              include: { menu: true },
            },
          },
        },
        address: true,
        status: true,
      },
      orderBy: { orderDate: "desc" },
    }) as Promise<OrderWithFullDetails[]>;
  }
}

export const orderRepository = new OrderRepository();
