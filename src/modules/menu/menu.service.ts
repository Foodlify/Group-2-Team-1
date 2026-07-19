import prisma from "../../config/prisma";
import { AppError } from "../../middlewares/error.middleware";
import { menuRepository } from "./menu.repository";

export class MenuService {
  async createMenuService(data: any) {
    // get the current restruant
    {
      /*
my options
- to search about this user in admins by role
- get the ownerid of the restuarant
      */
    }
    const restaurant = await prisma.restaurant.findFirst({
      where: {
        ownerId: data.ownerId,
      },
    });

    if (!restaurant) {
      throw new AppError("Restaurant not found for the given ownerId", 404);
    }
    const menu = await menuRepository.createMenu({
      restrauntid: restaurant?.id,
      items: {
        create: data.items.map((item: any) => ({
          name: item.name,
          price: item.price,
        })),
      },
      createdAt: new Date(),
    });

    return menu;
  }

  //get menu by restuarant id
  async getMenuByRestaurantIdService(restaurantId: string) {
    const menu = await prisma.menu.findFirst({
      where: {
        restaurantId,
      },
    });

    return menu;
  }
  async updateMenuService(menuId: string, data: any) {
    // get the menu id  after get rest id
    // const menu = await prisma.menu.find
    const updatedMenu = await prisma.menu.update({
      where: {
        id: menuId,
      },
      data: {
        items: data.items.map((item: any) => ({
          name: item.name,
          price: item.price,
        })),
        updatedAt: new Date(),
      },
    });

    return updatedMenu;
  }
}

export const menuService = new MenuService();
