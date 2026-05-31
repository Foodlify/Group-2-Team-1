import type { Prisma } from "../../generated/prisma/client";
import type { MenuItemModel } from "../../generated/prisma/models";
import { AppError } from "../../middlewares/error.middleware";
import { catalogErrors } from "../../shared/exceptions/catalog.errors";
import { menuItemRepository } from "./menuItem.repository";
import type { MenuItemResponse } from "./menuItem.validation";

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
