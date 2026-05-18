import type { Prisma } from "../../generated/prisma/client";
import { menuItemRepository } from "./menuItem.repository";

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
}

export const menuItemService = new MenuItemService();
