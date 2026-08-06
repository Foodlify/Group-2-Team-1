import type { Prisma } from "../../generated/prisma/client";
import type { MenuItemModel } from "../../generated/prisma/models";
import { AppError } from "../../middlewares/error.middleware";
import { catalogErrors } from "../../shared/exceptions/catalog.errors";
import { isForeignKeyViolation } from "../../shared/exceptions/prisma.errors";
import { menuRepository } from "../menu/menu.repository";
import { menuHistoryRepository } from "../menu/menuHistory.repository";
import { menuItemRepository } from "./menuItem.repository";
import type {
  CreateMenuItemInput,
  MenuItemResponse,
  MenuItemSearchQuery,
  MenuItemSearchResult,
  UpdateMenuItemInput,
} from "./menuItem.validation";

class MenuItemService {
  // ─── Used internally by cart/order — keep signatures stable ──
  async findById(id: string) {
    return menuItemRepository.findById(id);
  }

  async findByIdWithMenu(id: string, tx?: Prisma.TransactionClient) {
    return menuItemRepository.findByIdWithMenu(id, tx);
  }

  async findManyByIds(ids: string[]) {
    return menuItemRepository.findManyByIds(ids);
  }

  // ─── Public catalog reads ─────────────────────────────
  async getByIdOrThrow(id: string): Promise<MenuItemResponse> {
    const item = await menuItemRepository.findById(id);
    if (!item) {
      throw new AppError(
        catalogErrors.MENU_ITEM_NOT_FOUND.message,
        catalogErrors.MENU_ITEM_NOT_FOUND.statusCode,
      );
    }
    return this.toMenuItemResponse(item);
  }

  async listByMenu(menuId: string): Promise<MenuItemResponse[]> {
    const items = await menuItemRepository.findByMenuId(menuId);
    return items.map((i) => this.toMenuItemResponse(i));
  }

  /** Official "Search Menu Items" — catalog-wide, with menu + restaurant context. */
  async search(query: MenuItemSearchQuery): Promise<{
    data: MenuItemSearchResult[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = await menuItemRepository.searchPaginated(
      query.page,
      query.limit,
      query.search,
    );
    return {
      data: page.data.map((i) => ({
        id: i.id,
        name: i.name,
        price: Number(i.price),
        menu: { id: i.menu.id, name: i.menu.name },
        restaurant: { id: i.menu.restaurant.id, name: i.menu.restaurant.name },
      })),
      meta: page.meta,
    };
  }

  // ─── Admin management (CRUD) ──────────────────────────
  async create(input: CreateMenuItemInput): Promise<MenuItemResponse> {
    if (!(await menuRepository.findById(input.menuId))) {
      throw new AppError(
        catalogErrors.MENU_NOT_FOUND.message,
        catalogErrors.MENU_NOT_FOUND.statusCode,
      );
    }
    const item = await menuItemRepository.create({
      data: { menuId: input.menuId, name: input.name, price: input.price },
    });
    await menuHistoryRepository.log({
      menuId: item.menuId,
      entity: "MENU_ITEM",
      entityId: item.id,
      action: "CREATED",
      snapshot: { name: item.name, price: Number(item.price) },
    });
    return this.toMenuItemResponse(item);
  }

  async update(
    id: string,
    input: UpdateMenuItemInput,
  ): Promise<MenuItemResponse> {
    await this.assertExists(id);
    const item = await menuItemRepository.update({
      where: { id },
      data: input,
    });
    await menuHistoryRepository.log({
      menuId: item.menuId,
      entity: "MENU_ITEM",
      entityId: item.id,
      action: "UPDATED",
      snapshot: { name: item.name, price: Number(item.price) },
    });
    return this.toMenuItemResponse(item);
  }

  async remove(id: string): Promise<void> {
    const item = await this.assertExists(id);
    try {
      await menuItemRepository.delete({ where: { id } });
    } catch (e) {
      // Referenced by cart items / order items via `onDelete: Restrict`.
      if (isForeignKeyViolation(e)) {
        throw new AppError(
          catalogErrors.RESOURCE_IN_USE.message,
          catalogErrors.RESOURCE_IN_USE.statusCode,
        );
      }
      throw e;
    }
    // Audit the removal with the last state the item had before deletion.
    await menuHistoryRepository.log({
      menuId: item.menuId,
      entity: "MENU_ITEM",
      entityId: item.id,
      action: "DELETED",
      snapshot: { name: item.name, price: Number(item.price) },
    });
  }

  private async assertExists(id: string): Promise<MenuItemModel> {
    const item = await menuItemRepository.findById(id);
    if (!item) {
      throw new AppError(
        catalogErrors.MENU_ITEM_NOT_FOUND.message,
        catalogErrors.MENU_ITEM_NOT_FOUND.statusCode,
      );
    }
    return item;
  }

  toMenuItemResponse(item: MenuItemModel): MenuItemResponse {
    return {
      id: item.id,
      menuId: item.menuId,
      name: item.name,
      price: Number(item.price),
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }
}

export const menuItemService = new MenuItemService();
