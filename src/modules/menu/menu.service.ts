import type { MenuModel } from "../../generated/prisma/models";
import { AppError } from "../../middlewares/error.middleware";
import { catalogErrors } from "../../shared/exceptions/catalog.errors";
import { menuItemService } from "../menuItem/menuItem.service";
import { menuRepository } from "./menu.repository";
import type {
  MenuResponse,
  MenuWithItemsResponse,
} from "./menu.validation";
import type { MenuItemResponse } from "../menuItem/menuItem.validation";

const menuNotFound = (): AppError =>
  new AppError(
    catalogErrors.MENU_NOT_FOUND.message,
    catalogErrors.MENU_NOT_FOUND.statusCode,
  );

class MenuService {
  async listByRestaurant(restaurantId: string): Promise<MenuResponse[]> {
    const menus = await menuRepository.findByRestaurantId(restaurantId);
    return menus.map((m) => this.toMenuResponse(m));
  }

  async getByIdWithItems(id: string): Promise<MenuWithItemsResponse> {
    const menu = await menuRepository.findByIdWithItems(id);
    if (!menu) throw menuNotFound();
    return {
      ...this.toMenuResponse(menu),
      items: menu.menuItems.map((i) => menuItemService.toMenuItemResponse(i)),
    };
  }

  async listItems(menuId: string): Promise<MenuItemResponse[]> {
    const menu = await menuRepository.findById(menuId);
    if (!menu) throw menuNotFound();
    return menuItemService.listByMenu(menuId);
  }

  private toMenuResponse(menu: MenuModel): MenuResponse {
    return {
      id: menu.id,
      name: menu.name,
      restaurantId: menu.restaurantId,
      createdAt: menu.createdAt.toISOString(),
      updatedAt: menu.updatedAt.toISOString(),
    };
  }
}

export const menuService = new MenuService();
