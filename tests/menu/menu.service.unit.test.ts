/**
 * Menu Service — unit tests (history audit).
 *
 * Repositories are mocked so each test asserts pure service logic —
 * "IF the repository returns X, THEN the service does Y" — with no database.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/modules/menu/menu.repository", () => ({
  menuRepository: {
    findById: vi.fn(),
    findByIdWithItems: vi.fn(),
    findByRestaurantId: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
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

import { menuService } from "../../src/modules/menu/menu.service";
import { menuRepository } from "../../src/modules/menu/menu.repository";
import { menuHistoryRepository } from "../../src/modules/menu/menuHistory.repository";
import { restaurantRepository } from "../../src/modules/restaurant/restaurant.repository";
import { catalogErrors } from "../../src/shared/exceptions/catalog.errors";

const mockedMenus = vi.mocked(menuRepository);
const mockedHistory = vi.mocked(menuHistoryRepository);
const mockedRestaurants = vi.mocked(restaurantRepository);

type RestaurantRow = NonNullable<
  Awaited<ReturnType<typeof restaurantRepository.findById>>
>;

const now = new Date("2026-08-06T10:00:00.000Z");
const menuRow = {
  id: "menu_1",
  name: "Dinner",
  restaurantId: "rest_1",
  createdAt: now,
  updatedAt: now,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("create", () => {
  it("logs a MENU CREATED entry after creating the menu", async () => {
    mockedRestaurants.findById.mockResolvedValue({
      id: "rest_1",
    } as unknown as RestaurantRow);
    mockedMenus.create.mockResolvedValue(menuRow);

    const result = await menuService.create({
      name: "Dinner",
      restaurantId: "rest_1",
    });

    expect(mockedHistory.log).toHaveBeenCalledWith({
      menuId: "menu_1",
      entity: "MENU",
      entityId: "menu_1",
      action: "CREATED",
      snapshot: { name: "Dinner" },
    });
    expect(result.items).toEqual([]);
  });
});

describe("update", () => {
  it("logs a MENU UPDATED entry with the new name", async () => {
    mockedMenus.findById.mockResolvedValue(menuRow);
    mockedMenus.update.mockResolvedValue({ ...menuRow, name: "Renamed" });
    mockedMenus.findByIdWithItems.mockResolvedValue({
      ...menuRow,
      name: "Renamed",
      menuItems: [],
    });

    await menuService.update("menu_1", { name: "Renamed" });

    expect(mockedHistory.log).toHaveBeenCalledWith({
      menuId: "menu_1",
      entity: "MENU",
      entityId: "menu_1",
      action: "UPDATED",
      snapshot: { name: "Renamed" },
    });
  });
});

describe("history", () => {
  it("throws 404 for an unknown menu", async () => {
    mockedMenus.findById.mockResolvedValue(null);

    await expect(
      menuService.history("nope", { page: 1, limit: 20 }),
    ).rejects.toMatchObject({
      statusCode: catalogErrors.MENU_NOT_FOUND.statusCode,
    });
    expect(mockedHistory.findPaginatedByMenu).not.toHaveBeenCalled();
  });

  it("maps history entries newest first with ISO dates", async () => {
    mockedMenus.findById.mockResolvedValue(menuRow);
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
        createdAt: now.toISOString(),
      },
    ]);
  });
});
