/**
 * MenuItem Service — soft delete + restore unit tests.
 *
 * The case this feature exists for: an item referenced by a past order could
 * never be hard-deleted (`onDelete: Restrict`), so menus accumulated dead
 * items. These assert that removing one now flags it, audits it, and drops the
 * cached menu it belonged to.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/modules/menuItem/menuItem.repository", () => ({
  menuItemRepository: {
    findById: vi.fn(),
    findByIdIncludingDeleted: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    softDeleteById: vi.fn(),
    restoreById: vi.fn(),
  },
}));

vi.mock("../../src/modules/menu/menu.repository", () => ({
  menuRepository: {
    findById: vi.fn(),
  },
}));

vi.mock("../../src/modules/menu/menuHistory.repository", () => ({
  menuHistoryRepository: {
    log: vi.fn(),
  },
}));

vi.mock("../../src/shared/cache/cache", () => ({
  cache: { get: vi.fn(), set: vi.fn(), del: vi.fn(), delByPrefix: vi.fn() },
  cacheKeys: {
    menu: (menuId: string) => `menu:${menuId}`,
    menusPrefix: "menu:",
  },
}));

import { Prisma } from "../../src/generated/prisma/client";
import { menuItemService } from "../../src/modules/menuItem/menuItem.service";
import { menuItemRepository } from "../../src/modules/menuItem/menuItem.repository";
import { menuRepository } from "../../src/modules/menu/menu.repository";
import { menuHistoryRepository } from "../../src/modules/menu/menuHistory.repository";
import { cache } from "../../src/shared/cache/cache";
import { catalogErrors } from "../../src/shared/exceptions/catalog.errors";

const mockedItems = vi.mocked(menuItemRepository);
const mockedMenus = vi.mocked(menuRepository);
const mockedHistory = vi.mocked(menuHistoryRepository);
const mockedCache = vi.mocked(cache);

type MenuRow = NonNullable<Awaited<ReturnType<typeof menuRepository.findById>>>;

const ADMIN = "user_admin";
const now = new Date("2026-08-06T10:00:00.000Z");
const itemRow = {
  id: "item_1",
  menuId: "menu_1",
  name: "Koshary",
  price: new Prisma.Decimal(30),
  stock: 5,
  isDeleted: false,
  createdBy: null,
  updatedBy: null,
  createdAt: now,
  updatedAt: now,
};
const deletedItemRow = { ...itemRow, isDeleted: true };
const liveMenu = { id: "menu_1" } as unknown as MenuRow;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("create", () => {
  it("stamps the actor on both auditing columns and logs who did it", async () => {
    mockedMenus.findById.mockResolvedValue(liveMenu);
    mockedItems.create.mockResolvedValue(itemRow);

    await menuItemService.create(
      { menuId: "menu_1", name: "Koshary", price: 30 },
      ADMIN,
    );

    expect(mockedItems.create).toHaveBeenCalledWith({
      data: {
        menuId: "menu_1",
        name: "Koshary",
        price: 30,
        stock: null,
        createdBy: ADMIN,
        updatedBy: ADMIN,
      },
    });
    expect(mockedHistory.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "CREATED", changedBy: ADMIN }),
    );
  });
});

describe("update", () => {
  it("stamps updatedBy without disturbing createdBy", async () => {
    mockedItems.findById.mockResolvedValue(itemRow);
    mockedItems.update.mockResolvedValue({ ...itemRow, name: "Koshary XL" });

    await menuItemService.update("item_1", { name: "Koshary XL" }, ADMIN);

    expect(mockedItems.update).toHaveBeenCalledWith({
      where: { id: "item_1" },
      data: { name: "Koshary XL", updatedBy: ADMIN },
    });
  });
});

describe("remove", () => {
  it("flags the item instead of deleting the row", async () => {
    mockedItems.findById.mockResolvedValue(itemRow);

    await menuItemService.remove("item_1", ADMIN);

    expect(mockedItems.softDeleteById).toHaveBeenCalledWith("item_1", ADMIN);
  });

  it("audits the removal with the item's last state and the actor", async () => {
    mockedItems.findById.mockResolvedValue(itemRow);

    await menuItemService.remove("item_1", ADMIN);

    expect(mockedHistory.log).toHaveBeenCalledWith({
      menuId: "menu_1",
      entity: "MENU_ITEM",
      entityId: "item_1",
      action: "DELETED",
      snapshot: { name: "Koshary", price: 30, stock: 5 },
      changedBy: ADMIN,
    });
  });

  it("drops the cached menu — otherwise the item survives in Redis", async () => {
    mockedItems.findById.mockResolvedValue(itemRow);

    await menuItemService.remove("item_1", ADMIN);

    expect(mockedCache.del).toHaveBeenCalledWith("menu:menu_1");
  });

  it("throws 404 for an item that is already gone", async () => {
    mockedItems.findById.mockResolvedValue(null);

    await expect(menuItemService.remove("nope", ADMIN)).rejects.toMatchObject({
      statusCode: catalogErrors.MENU_ITEM_NOT_FOUND.statusCode,
    });
    expect(mockedItems.softDeleteById).not.toHaveBeenCalled();
  });
});

describe("restore", () => {
  it("clears the flag, drops the cache and logs a RESTORED entry", async () => {
    mockedItems.findByIdIncludingDeleted.mockResolvedValue(deletedItemRow);
    mockedMenus.findById.mockResolvedValue(liveMenu);

    const result = await menuItemService.restore("item_1", ADMIN);

    expect(mockedItems.restoreById).toHaveBeenCalledWith("item_1", ADMIN);
    expect(mockedCache.del).toHaveBeenCalledWith("menu:menu_1");
    expect(mockedHistory.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "RESTORED", changedBy: ADMIN }),
    );
    expect(result.isDeleted).toBe(false);
  });

  it("refuses to restore an item that was never deleted", async () => {
    mockedItems.findByIdIncludingDeleted.mockResolvedValue(itemRow);

    await expect(
      menuItemService.restore("item_1", ADMIN),
    ).rejects.toMatchObject({
      message: catalogErrors.NOT_DELETED.message,
      statusCode: catalogErrors.NOT_DELETED.statusCode,
    });
    expect(mockedItems.restoreById).not.toHaveBeenCalled();
  });

  it("refuses to restore into a still-deleted menu", async () => {
    mockedItems.findByIdIncludingDeleted.mockResolvedValue(deletedItemRow);
    // Filtered lookup finds nothing → the menu is itself soft-deleted.
    mockedMenus.findById.mockResolvedValue(null);

    await expect(
      menuItemService.restore("item_1", ADMIN),
    ).rejects.toMatchObject({
      message: catalogErrors.PARENT_DELETED.message,
      statusCode: catalogErrors.PARENT_DELETED.statusCode,
    });
    expect(mockedItems.restoreById).not.toHaveBeenCalled();
  });

  it("throws 404 when the id matches nothing at all", async () => {
    mockedItems.findByIdIncludingDeleted.mockResolvedValue(null);

    await expect(menuItemService.restore("nope", ADMIN)).rejects.toMatchObject({
      statusCode: catalogErrors.MENU_ITEM_NOT_FOUND.statusCode,
    });
  });
});
