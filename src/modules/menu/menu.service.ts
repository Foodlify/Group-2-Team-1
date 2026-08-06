import type { MenuModel } from "../../generated/prisma/models";
import { AppError } from "../../middlewares/error.middleware";
import { catalogErrors } from "../../shared/exceptions/catalog.errors";
import { isForeignKeyViolation } from "../../shared/exceptions/prisma.errors";
import { menuItemService } from "../menuItem/menuItem.service";
// Imported as a repository (not the service) to avoid a circular dependency:
// restaurant.service already imports menuService.
import { restaurantRepository } from "../restaurant/restaurant.repository";
import { menuRepository } from "./menu.repository";
import { menuHistoryRepository } from "./menuHistory.repository";
import type { PaginationMeta } from "../../shared/schemas/pagination.schema";
import type {
  CreateMenuInput,
  MenuChangeLogResponse,
  MenuHistoryQuery,
  MenuResponse,
  MenuWithItemsResponse,
  UpdateMenuInput,
} from "./menu.validation";
import type { MenuItemResponse } from "../menuItem/menuItem.validation";

const menuNotFound = (): AppError =>
  new AppError(
    catalogErrors.MENU_NOT_FOUND.message,
    catalogErrors.MENU_NOT_FOUND.statusCode,
  );

const restaurantNotFound = (): AppError =>
  new AppError(
    catalogErrors.RESTAURANT_NOT_FOUND.message,
    catalogErrors.RESTAURANT_NOT_FOUND.statusCode,
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

  // ─── Admin management (CRUD) ──────────────────────────
  async create(input: CreateMenuInput): Promise<MenuWithItemsResponse> {
    if (!(await restaurantRepository.findById(input.restaurantId))) {
      throw restaurantNotFound();
    }
    const menu = await menuRepository.create({
      data: { name: input.name, restaurantId: input.restaurantId },
    });
    await menuHistoryRepository.log({
      menuId: menu.id,
      entity: "MENU",
      entityId: menu.id,
      action: "CREATED",
      snapshot: { name: menu.name },
    });
    // A freshly created menu has no items yet.
    return { ...this.toMenuResponse(menu), items: [] };
  }

  async update(
    id: string,
    input: UpdateMenuInput,
  ): Promise<MenuWithItemsResponse> {
    await this.assertExists(id);
    const updated = await menuRepository.update({ where: { id }, data: input });
    await menuHistoryRepository.log({
      menuId: id,
      entity: "MENU",
      entityId: id,
      action: "UPDATED",
      snapshot: { name: updated.name },
    });
    return this.getByIdWithItems(id);
  }

  /** Official "View History List of Menu" — newest first (ADMIN). */
  async history(
    menuId: string,
    query: MenuHistoryQuery,
  ): Promise<{ data: MenuChangeLogResponse[]; meta: PaginationMeta }> {
    await this.assertExists(menuId);
    const page = await menuHistoryRepository.findPaginatedByMenu(
      menuId,
      query.page,
      query.limit,
    );
    return {
      data: page.data.map((e) => ({
        id: e.id,
        entity: e.entity,
        entityId: e.entityId,
        action: e.action,
        snapshot: (e.snapshot ?? {}) as Record<string, unknown>,
        createdAt: e.createdAt.toISOString(),
      })),
      meta: page.meta,
    };
  }

  async remove(id: string): Promise<void> {
    await this.assertExists(id);
    try {
      await menuRepository.delete({ where: { id } });
    } catch (e) {
      // Cascades to menu items, which may be referenced by carts/orders
      // (`onDelete: Restrict`).
      if (isForeignKeyViolation(e)) {
        throw new AppError(
          catalogErrors.RESOURCE_IN_USE.message,
          catalogErrors.RESOURCE_IN_USE.statusCode,
        );
      }
      throw e;
    }
  }

  private async assertExists(id: string): Promise<MenuModel> {
    const menu = await menuRepository.findById(id);
    if (!menu) throw menuNotFound();
    return menu;
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
