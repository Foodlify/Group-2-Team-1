import { AppError } from "../../middlewares/error.middleware";
import prisma from "../../config/prisma";
import { restaurantRepository } from "./restaurant.repository";
import type {
  RegisterRestaurantInput,
  UpdateRestaurantInput,
} from "./restaurant.validation";

class RestaurantService {
  async register(ownerId: string, input: RegisterRestaurantInput) {
    const existing = await restaurantRepository.findFirst({
      where: { ownerId },
    });
    if (existing) {
      throw new AppError("You already have a registered restaurant", 409);
    }

    const restaurant = await restaurantRepository.create({
      data: { name: input.name, ownerId },
    });

    return restaurant;
  }

  async getMyRestaurant(ownerId: string) {
    const restaurant = await restaurantRepository.findFirst({
      where: { ownerId },
    });
    if (!restaurant) {
      throw new AppError("Restaurant not found", 404);
    }
    return restaurant;
  }

  async updateMyRestaurant(ownerId: string, input: UpdateRestaurantInput) {
    const restaurant = await restaurantRepository.findFirst({
      where: { ownerId },
      select: { id: true },
    });
    if (!restaurant) {
      throw new AppError("Restaurant not found", 404);
    }

    const updated = await restaurantRepository.update({
      where: { id: restaurant.id },
      data: { name: input.name },
    });

    return updated;
  }

  async getOrders(ownerId: string) {
    const restaurant = await restaurantRepository.findFirst({
      where: { ownerId },
      select: { id: true },
    });
    if (!restaurant) {
      throw new AppError("Restaurant not found", 404);
    }

    return prisma.order.findMany({
      where: {
        items: {
          some: {
            menuItem: {
              menu: { restaurantId: restaurant.id },
            },
          },
        },
      },
      include: {
        address: true,
        status: true,
      },
      orderBy: { orderDate: "asc" },
    });
  }

  async updateOrderStatus(ownerId: string, orderId: string, status: string) {
    const restaurant = await restaurantRepository.findFirst({
      where: { ownerId },
      select: { id: true },
    });
    if (!restaurant) {
      throw new AppError("Restaurant not found", 404);
    }

    const updated = await prisma.orderStatus.upsert({
      where: { orderId },
      create: { orderId, status }, // create row if none exists
      update: { status }, // update if it does exist
    });

    return updated;
  }
}

export const restaurantService = new RestaurantService();
