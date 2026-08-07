import type { MenuModel } from "../../generated/prisma/models";
import { AppError } from "../../middlewares/error.middleware";
import { catalogErrors } from "../../shared/exceptions/catalog.errors";
import { menuItemService } from "../menuItem/menuItem.service";
import { menuItemRepository } from "../menuItem/menuItem.repository";
// Imported as a repository (not the service) to avoid a circular dependency:
// restaurant.service already imports menuService.
import { restaurantRepository } from "../restaurant/restaurant.repository";
import { cache, cacheKeys } from "../../shared/cache/cache";
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
  async listByRestaurant(
    restaurantId: string,
    includeDeleted = false,
  ): Promise<MenuResponse[]> {
    const menus = await menuRepository.findByRestaurantId(
      restaurantId,
      includeDeleted,
    );
    return menus.map((m) => this.toMenuResponse(m));
  }

  /**
   * Cache-aside: menus are read constantly and written rarely, the other half
   * of the official caching requirement alongside the cart. Every admin write
   * below invalidates the key (see `invalidateMenu`).
   */
  async getByIdWithItems(id: string): Promise<MenuWithItemsResponse> {
    const cached = await cache.get<MenuWithItemsResponse>(cacheKeys.menu(id));
    if (cached) return cached;

    const menu = await menuRepository.findByIdWithItems(id);
    if (!menu) throw menuNotFound();
    const response = {
      ...this.toMenuResponse(menu),
      items: menu.menuItems.map((i) => menuItemService.toMenuItemResponse(i)),
    };
    await cache.set(cacheKeys.menu(id), response);
    return response;
  }

  /** Called by this service and by menuItem.service after any catalog write. */
  async invalidateMenu(menuId: string): Promise<void> {
    await cache.del(cacheKeys.menu(menuId));
  }

  async listItems(
    menuId: string,
    includeDeleted = false,
  ): Promise<MenuItemResponse[]> {
    // An admin asking for deleted items has to be able to reach them through a
    // deleted menu too, otherwise a cascaded delete is a dead end.
    const menu = includeDeleted
      ? await menuRepository.findByIdIncludingDeleted(menuId)
      : await menuRepository.findById(menuId);
    if (!menu) throw menuNotFound();
    return menuItemService.listByMenu(menuId, includeDeleted);
  }

  // ─── Admin management (CRUD) ──────────────────────────
  async create(
    input: CreateMenuInput,
    actorId: string,
  ): Promise<MenuWithItemsResponse> {
    if (!(await restaurantRepository.findById(input.restaurantId))) {
      throw restaurantNotFound();
    }
    const menu = await menuRepository.create({
      data: {
        name: input.name,
        restaurantId: input.restaurantId,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
    await menuHistoryRepository.log({
      menuId: menu.id,
      entity: "MENU",
      entityId: menu.id,
      action: "CREATED",
      snapshot: { name: menu.name },
      changedBy: actorId,
    });
    // A freshly created menu has no items yet.
    return { ...this.toMenuResponse(menu), items: [] };
  }

  async update(
    id: string,
    input: UpdateMenuInput,
    actorId: string,
  ): Promise<MenuWithItemsResponse> {
    await this.assertExists(id);
    const updated = await menuRepository.update({
      where: { id },
      data: { ...input, updatedBy: actorId },
    });
    await menuHistoryRepository.log({
      menuId: id,
      entity: "MENU",
      entityId: id,
      action: "UPDATED",
      snapshot: { name: updated.name },
      changedBy: actorId,
    });
    await this.invalidateMenu(id);
    return this.getByIdWithItems(id);
  }

  /** Official "View History List of Menu" — newest first (ADMIN). */
  async history(
    menuId: string,
    query: MenuHistoryQuery,
  ): Promise<{ data: MenuChangeLogResponse[]; meta: PaginationMeta }> {
    // Deliberately resolves deleted menus too — the history of a menu that was
    // just deleted is precisely what an admin needs to see to undo it.
    const menu = await menuRepository.findByIdIncludingDeleted(menuId);
    if (!menu) throw menuNotFound();
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
        changedBy: e.changedBy,
        createdAt: e.createdAt.toISOString(),
      })),
      meta: page.meta,
    };
  }

  /**
   * Soft delete, cascading to the menu's items in one transaction. Unlike the
   * hard delete this replaces, it can never fail on a reference from an older
   * cart or order — which was the whole problem: a menu whose items had ever
   * been ordered could not be retired.
   */
  async remove(id: string, actorId: string): Promise<void> {
    const menu = await this.assertExists(id);
    await menuRepository.transaction(async (tx) => {
      await menuItemRepository.softDeleteByMenuIds([id], actorId, tx);
      await menuRepository.softDeleteById(id, actorId, tx);
    });
    await this.invalidateMenu(id);
    await menuHistoryRepository.log({
      menuId: id,
      entity: "MENU",
      entityId: id,
      action: "DELETED",
      snapshot: { name: menu.name },
      changedBy: actorId,
    });
  }

  /** Undoes `remove`, restoring the menu's items along with it. */
  async restore(id: string, actorId: string): Promise<MenuWithItemsResponse> {
    const menu = await menuRepository.findByIdIncludingDeleted(id);
    if (!menu) throw menuNotFound();
    if (!menu.isDeleted) {
      throw new AppError(
        catalogErrors.NOT_DELETED.message,
        catalogErrors.NOT_DELETED.statusCode,
      );
    }
    // Same reason as menu items: restoring into a deleted restaurant would
    // leave the menu just as invisible as it was.
    if (!(await restaurantRepository.findById(menu.restaurantId))) {
      throw new AppError(
        catalogErrors.PARENT_RESTAURANT_DELETED.message,
        catalogErrors.PARENT_RESTAURANT_DELETED.statusCode,
      );
    }
    await menuRepository.transaction(async (tx) => {
      await menuItemRepository.restoreByMenuIds([id], actorId, tx);
      await menuRepository.restoreById(id, actorId, tx);
    });
    await this.invalidateMenu(id);
    await menuHistoryRepository.log({
      menuId: id,
      entity: "MENU",
      entityId: id,
      action: "RESTORED",
      snapshot: { name: menu.name },
      changedBy: actorId,
    });
    return this.getByIdWithItems(id);
  }

  private async assertExists(id: string): Promise<MenuModel> {
    const menu = await menuRepository.findById(id);
    if (!menu) throw menuNotFound();
    return menu;
  }

  /** `createdBy` / `updatedBy` stay internal — see `restaurant.service`. */
  private toMenuResponse(menu: MenuModel): MenuResponse {
    return {
      id: menu.id,
      name: menu.name,
      restaurantId: menu.restaurantId,
      isDeleted: menu.isDeleted,
      createdAt: menu.createdAt.toISOString(),
      updatedAt: menu.updatedAt.toISOString(),
    };
  }
}

export const menuService = new MenuService();
