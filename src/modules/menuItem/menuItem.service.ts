import type { Prisma } from "../../generated/prisma/client";
import type { MenuItemModel } from "../../generated/prisma/models";
import { AppError } from "../../middlewares/error.middleware";
import { catalogErrors } from "../../shared/exceptions/catalog.errors";
import { cache, cacheKeys } from "../../shared/cache/cache";
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
  async findById(id: string) {
    return menuItemRepository.findById(id);
  }

  async findByIdWithMenu(id: string, tx?: Prisma.TransactionClient) {
    return menuItemRepository.findByIdWithMenu(id, tx);
  }

  async findManyByIds(ids: string[]) {
    return menuItemRepository.findManyByIds(ids);
  }

  async reserveStock(
    menuItemId: string,
    quantity: number,
    tx: Prisma.TransactionClient,
  ): Promise<boolean> {
    return menuItemRepository.reserveStock(menuItemId, quantity, tx);
  }

  async releaseStock(
    menuItemId: string,
    quantity: number,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    return menuItemRepository.releaseStock(menuItemId, quantity, tx);
  }

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

  async listByMenu(
    menuId: string,
    includeDeleted = false,
  ): Promise<MenuItemResponse[]> {
    const items = await menuItemRepository.findByMenuId(menuId, includeDeleted);
    return items.map((i) => this.toMenuItemResponse(i));
  }

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
        stock: i.stock,
        menu: { id: i.menu.id, name: i.menu.name },
        restaurant: { id: i.menu.restaurant.id, name: i.menu.restaurant.name },
      })),
      meta: page.meta,
    };
  }

  async create(
    input: CreateMenuItemInput,
    actorId: string,
  ): Promise<MenuItemResponse> {
    if (!(await menuRepository.findById(input.menuId))) {
      throw new AppError(
        catalogErrors.MENU_NOT_FOUND.message,
        catalogErrors.MENU_NOT_FOUND.statusCode,
      );
    }
    const item = await menuItemRepository.create({
      data: {
        menuId: input.menuId,
        name: input.name,
        price: input.price,
        stock: input.stock ?? null,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
    await cache.del(cacheKeys.menu(item.menuId));
    await menuHistoryRepository.log({
      menuId: item.menuId,
      entity: "MENU_ITEM",
      entityId: item.id,
      action: "CREATED",
      snapshot: {
        name: item.name,
        price: Number(item.price),
        stock: item.stock,
      },
      changedBy: actorId,
    });
    return this.toMenuItemResponse(item);
  }

  async update(
    id: string,
    input: UpdateMenuItemInput,
    actorId: string,
  ): Promise<MenuItemResponse> {
    await this.assertExists(id);
    const item = await menuItemRepository.update({
      where: { id },
      data: { ...input, updatedBy: actorId },
    });
    await cache.del(cacheKeys.menu(item.menuId));
    await menuHistoryRepository.log({
      menuId: item.menuId,
      entity: "MENU_ITEM",
      entityId: item.id,
      action: "UPDATED",
      snapshot: {
        name: item.name,
        price: Number(item.price),
        stock: item.stock,
      },
      changedBy: actorId,
    });
    return this.toMenuItemResponse(item);
  }

  async remove(id: string, actorId: string): Promise<void> {
    const item = await this.assertExists(id);
    await menuItemRepository.softDeleteById(id, actorId);

    await cache.del(cacheKeys.menu(item.menuId));
    await menuHistoryRepository.log({
      menuId: item.menuId,
      entity: "MENU_ITEM",
      entityId: item.id,
      action: "DELETED",
      snapshot: {
        name: item.name,
        price: Number(item.price),
        stock: item.stock,
      },
      changedBy: actorId,
    });
  }

  async restore(id: string, actorId: string): Promise<MenuItemResponse> {
    const item = await menuItemRepository.findByIdIncludingDeleted(id);
    if (!item) {
      throw new AppError(
        catalogErrors.MENU_ITEM_NOT_FOUND.message,
        catalogErrors.MENU_ITEM_NOT_FOUND.statusCode,
      );
    }
    if (!item.isDeleted) {
      throw new AppError(
        catalogErrors.NOT_DELETED.message,
        catalogErrors.NOT_DELETED.statusCode,
      );
    }
    if (!(await menuRepository.findById(item.menuId))) {
      throw new AppError(
        catalogErrors.PARENT_DELETED.message,
        catalogErrors.PARENT_DELETED.statusCode,
      );
    }
    await menuItemRepository.restoreById(id, actorId);
    await cache.del(cacheKeys.menu(item.menuId));
    await menuHistoryRepository.log({
      menuId: item.menuId,
      entity: "MENU_ITEM",
      entityId: item.id,
      action: "RESTORED",
      snapshot: {
        name: item.name,
        price: Number(item.price),
        stock: item.stock,
      },
      changedBy: actorId,
    });
    return this.toMenuItemResponse({ ...item, isDeleted: false });
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
      stock: item.stock,
      isDeleted: item.isDeleted,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }
}

export const menuItemService = new MenuItemService();
