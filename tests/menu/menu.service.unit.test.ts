/**
 * Menu Service — unit tests (history audit + soft delete).
 *
 * Repositories are mocked so each test asserts pure service logic —
 * "IF the repository returns X, THEN the service does Y" — with no database.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/modules/menu/menu.repository", () => ({
  menuRepository: {
    findById: vi.fn(),
    findByIdIncludingDeleted: vi.fn(),
    findByIdWithItems: vi.fn(),
    findByRestaurantId: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    softDeleteById: vi.fn(),
    restoreById: vi.fn(),
    transaction: vi.fn(),
  },
}));

vi.mock("../../src/modules/menu/menuHistory.repository", () => ({
  menuHistoryRepository: {
    log: vi.fn(),
    findPaginatedByMenu: vi.fn(),
  },
}));

vi.mock("../../src/modules/restaurant/restaurant.repository", () => ({
  restaurantRepository: {
    findById: vi.fn(),
  },
}));

vi.mock("../../src/modules/menuItem/menuItem.service", () => ({
  menuItemService: {
    toMenuItemResponse: vi.fn(),
    listByMenu: vi.fn(),
  },
}));

vi.mock("../../src/modules/menuItem/menuItem.repository", () => ({
  menuItemRepository: {
    softDeleteByMenuIds: vi.fn(),
    restoreByMenuIds: vi.fn(),
  },
}));

vi.mock("../../src/shared/cache/cache", () => ({
  cache: { get: vi.fn(), set: vi.fn(), del: vi.fn(), delByPrefix: vi.fn() },
  cacheKeys: {
    menu: (menuId: string) => `menu:${menuId}`,
    menusPrefix: "menu:",
  },
}));

import { menuService } from "../../src/modules/menu/menu.service";
import { menuRepository } from "../../src/modules/menu/menu.repository";
import { menuItemRepository } from "../../src/modules/menuItem/menuItem.repository";
import { menuHistoryRepository } from "../../src/modules/menu/menuHistory.repository";
import { restaurantRepository } from "../../src/modules/restaurant/restaurant.repository";
import { cache } from "../../src/shared/cache/cache";
import { catalogErrors } from "../../src/shared/exceptions/catalog.errors";

const mockedMenus = vi.mocked(menuRepository);
const mockedItems = vi.mocked(menuItemRepository);
const mockedHistory = vi.mocked(menuHistoryRepository);
const mockedRestaurants = vi.mocked(restaurantRepository);
const mockedCache = vi.mocked(cache);

type RestaurantRow = NonNullable<
  Awaited<ReturnType<typeof restaurantRepository.findById>>
>;

const ADMIN = "user_admin";
const now = new Date("2026-08-06T10:00:00.000Z");
const menuRow = {
  id: "menu_1",
  name: "Dinner",
  restaurantId: "rest_1",
  isDeleted: false,
  createdBy: null,
  updatedBy: null,
  createdAt: now,
  updatedAt: now,
};
const deletedMenuRow = { ...menuRow, isDeleted: true };
const liveRestaurant = { id: "rest_1" } as unknown as RestaurantRow;

beforeEach(() => {
  vi.clearAllMocks();
  mockedMenus.transaction.mockImplementation(
    async (cb: (tx: never) => Promise<unknown>) => cb({} as never),
  );
});

describe("create", () => {
  it("logs a MENU CREATED entry carrying the actor", async () => {
    mockedRestaurants.findById.mockResolvedValue(liveRestaurant);
    mockedMenus.create.mockResolvedValue(menuRow);

    const result = await menuService.create(
      { name: "Dinner", restaurantId: "rest_1" },
      ADMIN,
    );

    expect(mockedMenus.create).toHaveBeenCalledWith({
      data: {
        name: "Dinner",
        restaurantId: "rest_1",
        createdBy: ADMIN,
        updatedBy: ADMIN,
      },
    });
    expect(mockedHistory.log).toHaveBeenCalledWith({
      menuId: "menu_1",
      entity: "MENU",
      entityId: "menu_1",
      action: "CREATED",
      snapshot: { name: "Dinner" },
      changedBy: ADMIN,
    });
    expect(result.items).toEqual([]);
  });
});

describe("update", () => {
  it("logs a MENU UPDATED entry with the new name and the actor", async () => {
    mockedMenus.findById.mockResolvedValue(menuRow);
    mockedMenus.update.mockResolvedValue({ ...menuRow, name: "Renamed" });
    mockedMenus.findByIdWithItems.mockResolvedValue({
      ...menuRow,
      name: "Renamed",
      menuItems: [],
    });

    await menuService.update("menu_1", { name: "Renamed" }, ADMIN);

    expect(mockedMenus.update).toHaveBeenCalledWith({
      where: { id: "menu_1" },
      data: { name: "Renamed", updatedBy: ADMIN },
    });
    expect(mockedHistory.log).toHaveBeenCalledWith({
      menuId: "menu_1",
      entity: "MENU",
      entityId: "menu_1",
      action: "UPDATED",
      snapshot: { name: "Renamed" },
      changedBy: ADMIN,
    });
  });
});

describe("remove", () => {
  it("flags the menu and its items in one transaction", async () => {
    mockedMenus.findById.mockResolvedValue(menuRow);

    await menuService.remove("menu_1", ADMIN);

    expect(mockedMenus.transaction).toHaveBeenCalledTimes(1);
    expect(mockedItems.softDeleteByMenuIds).toHaveBeenCalledWith(
      ["menu_1"],
      ADMIN,
      expect.anything(),
    );
    expect(mockedMenus.softDeleteById).toHaveBeenCalledWith(
      "menu_1",
      ADMIN,
      expect.anything(),
    );
    expect(mockedCache.del).toHaveBeenCalledWith("menu:menu_1");
  });

  it("records the delete in the menu history", async () => {
    mockedMenus.findById.mockResolvedValue(menuRow);

    await menuService.remove("menu_1", ADMIN);

    expect(mockedHistory.log).toHaveBeenCalledWith({
      menuId: "menu_1",
      entity: "MENU",
      entityId: "menu_1",
      action: "DELETED",
      snapshot: { name: "Dinner" },
      changedBy: ADMIN,
    });
  });

  it("throws 404 without flagging anything when the menu is gone", async () => {
    mockedMenus.findById.mockResolvedValue(null);

    await expect(menuService.remove("nope", ADMIN)).rejects.toMatchObject({
      statusCode: catalogErrors.MENU_NOT_FOUND.statusCode,
    });
    expect(mockedMenus.softDeleteById).not.toHaveBeenCalled();
  });
});

describe("restore", () => {
  it("brings the menu and its items back and logs it", async () => {
    mockedMenus.findByIdIncludingDeleted.mockResolvedValue(deletedMenuRow);
    mockedRestaurants.findById.mockResolvedValue(liveRestaurant);
    mockedMenus.findByIdWithItems.mockResolvedValue({
      ...menuRow,
      menuItems: [],
    });

    await menuService.restore("menu_1", ADMIN);

    expect(mockedItems.restoreByMenuIds).toHaveBeenCalledWith(
      ["menu_1"],
      ADMIN,
      expect.anything(),
    );
    expect(mockedMenus.restoreById).toHaveBeenCalledWith(
      "menu_1",
      ADMIN,
      expect.anything(),
    );
    expect(mockedHistory.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "RESTORED", changedBy: ADMIN }),
    );
  });

  it("refuses to restore a menu that was never deleted", async () => {
    mockedMenus.findByIdIncludingDeleted.mockResolvedValue(menuRow);

    await expect(menuService.restore("menu_1", ADMIN)).rejects.toMatchObject({
      statusCode: catalogErrors.NOT_DELETED.statusCode,
    });
    expect(mockedMenus.restoreById).not.toHaveBeenCalled();
  });

  it("refuses to restore into a still-deleted restaurant", async () => {
    mockedMenus.findByIdIncludingDeleted.mockResolvedValue(deletedMenuRow);
    // Filtered lookup returns nothing → the restaurant is itself deleted.
    mockedRestaurants.findById.mockResolvedValue(null);

    await expect(menuService.restore("menu_1", ADMIN)).rejects.toMatchObject({
      message: catalogErrors.PARENT_RESTAURANT_DELETED.message,
      statusCode: catalogErrors.PARENT_RESTAURANT_DELETED.statusCode,
    });
    expect(mockedMenus.restoreById).not.toHaveBeenCalled();
  });
});

describe("history", () => {
  it("throws 404 for an unknown menu", async () => {
    mockedMenus.findByIdIncludingDeleted.mockResolvedValue(null);

    await expect(
      menuService.history("nope", { page: 1, limit: 20 }),
    ).rejects.toMatchObject({
      statusCode: catalogErrors.MENU_NOT_FOUND.statusCode,
    });
    expect(mockedHistory.findPaginatedByMenu).not.toHaveBeenCalled();
  });

  it("still serves the history of a deleted menu — that's when it's needed", async () => {
    mockedMenus.findByIdIncludingDeleted.mockResolvedValue(deletedMenuRow);
    mockedHistory.findPaginatedByMenu.mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });

    await menuService.history("menu_1", { page: 1, limit: 20 });

    expect(mockedHistory.findPaginatedByMenu).toHaveBeenCalledWith(
      "menu_1",
      1,
      20,
    );
  });

  it("maps history entries newest first with ISO dates and the actor", async () => {
    mockedMenus.findByIdIncludingDeleted.mockResolvedValue(menuRow);
    const meta = { page: 1, limit: 20, total: 1, totalPages: 1 };
    mockedHistory.findPaginatedByMenu.mockResolvedValue({
      data: [
        {
          id: "log_1",
          menuId: "menu_1",
          entity: "MENU_ITEM" as const,
          entityId: "item_1",
          action: "DELETED" as const,
          snapshot: { name: "Koshary", price: 30 },
          changedBy: ADMIN,
          createdAt: now,
        },
      ],
      meta,
    });

    const result = await menuService.history("menu_1", { page: 1, limit: 20 });

    expect(result.meta).toEqual(meta);
    expect(result.data).toEqual([
      {
        id: "log_1",
        entity: "MENU_ITEM",
        entityId: "item_1",
        action: "DELETED",
        snapshot: { name: "Koshary", price: 30 },
        changedBy: ADMIN,
        createdAt: now.toISOString(),
      },
    ]);
  });
});
