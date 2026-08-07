/**
 * Restaurant Service — unit tests.
 *
 * Pattern ported from Kamal's `customer-management` branch: the repository and
 * collaborating services are mocked so each test asserts pure service logic —
 * "IF the repository returns X, THEN the service does Y" — with no database.
 *
 * `vi.mock` calls are hoisted above the imports by Vitest, so the service
 * receives the mocked modules when it loads.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/modules/restaurant/restaurant.repository", () => ({
  restaurantRepository: {
    listPaginated: vi.fn(),
    findById: vi.fn(),
    findByIdIncludingDeleted: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    softDeleteById: vi.fn(),
    restoreById: vi.fn(),
    // Runs the callback against a stub client — the service's cascade logic is
    // what's under test here, not Prisma's transaction semantics.
    transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({} as unknown),
    ),
  },
}));

vi.mock("../../src/modules/menu/menu.service", () => ({
  menuService: {
    listByRestaurant: vi.fn(),
  },
}));

vi.mock("../../src/modules/menu/menu.repository", () => ({
  menuRepository: {
    findIdsByRestaurantId: vi.fn(),
    softDeleteByRestaurantId: vi.fn(),
    restoreByRestaurantId: vi.fn(),
  },
}));

vi.mock("../../src/modules/menuItem/menuItem.repository", () => ({
  menuItemRepository: {
    softDeleteByMenuIds: vi.fn(),
    restoreByMenuIds: vi.fn(),
  },
}));

vi.mock("../../src/shared/cache/cache", () => ({
  cache: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    delByPrefix: vi.fn(),
  },
  cacheKeys: {
    menu: (menuId: string) => `menu:${menuId}`,
    menusPrefix: "menu:",
  },
}));

import { restaurantService } from "../../src/modules/restaurant/restaurant.service";
import { restaurantRepository } from "../../src/modules/restaurant/restaurant.repository";
import { menuRepository } from "../../src/modules/menu/menu.repository";
import { menuItemRepository } from "../../src/modules/menuItem/menuItem.repository";
import { menuService } from "../../src/modules/menu/menu.service";
import { cache } from "../../src/shared/cache/cache";
import { AppError } from "../../src/middlewares/error.middleware";
import { catalogErrors } from "../../src/shared/exceptions/catalog.errors";

const mocked = vi.mocked(restaurantRepository);
const mockedMenuRepo = vi.mocked(menuRepository);
const mockedItemRepo = vi.mocked(menuItemRepository);
const mockedMenus = vi.mocked(menuService);
const mockedCache = vi.mocked(cache);

const ADMIN = "user_admin";
const now = new Date("2026-08-06T10:00:00.000Z");
const restaurantRow = {
  id: "rest_1",
  name: "Koshary El Tahrir",
  isDeleted: false,
  createdBy: null,
  updatedBy: null,
  createdAt: now,
  updatedAt: now,
};
const deletedRow = { ...restaurantRow, isDeleted: true };

beforeEach(() => {
  vi.clearAllMocks();
  mocked.transaction.mockImplementation(
    async (cb: (tx: never) => Promise<unknown>) => cb({} as never),
  );
  mockedMenuRepo.findIdsByRestaurantId.mockResolvedValue([]);
});

describe("list", () => {
  it("maps rows to responses and passes pagination meta through", async () => {
    const meta = { page: 1, limit: 20, total: 1, totalPages: 1 };
    mocked.listPaginated.mockResolvedValue({ data: [restaurantRow], meta });

    const result = await restaurantService.list({ page: 1, limit: 20 });

    expect(mocked.listPaginated).toHaveBeenCalledWith(1, 20, undefined, false);
    expect(result.meta).toEqual(meta);
    expect(result.data).toEqual([
      {
        id: "rest_1",
        name: "Koshary El Tahrir",
        isDeleted: false,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    ]);
  });

  it("never leaks the auditing columns into the response", async () => {
    mocked.listPaginated.mockResolvedValue({
      data: [{ ...restaurantRow, createdBy: ADMIN, updatedBy: ADMIN }],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });

    const result = await restaurantService.list({ page: 1, limit: 20 });

    expect(result.data[0]).not.toHaveProperty("createdBy");
    expect(result.data[0]).not.toHaveProperty("updatedBy");
  });

  it("forwards the search term to the repository", async () => {
    mocked.listPaginated.mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });

    await restaurantService.list({ page: 1, limit: 20, search: "koshary" });

    expect(mocked.listPaginated).toHaveBeenCalledWith(1, 20, "koshary", false);
  });

  it("passes includeDeleted through when the caller is allowed", async () => {
    mocked.listPaginated.mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });

    await restaurantService.list({ page: 1, limit: 20 }, true);

    expect(mocked.listPaginated).toHaveBeenCalledWith(1, 20, undefined, true);
  });
});

describe("getByIdOrThrow", () => {
  it("returns the mapped restaurant when it exists", async () => {
    mocked.findById.mockResolvedValue(restaurantRow);

    const result = await restaurantService.getByIdOrThrow("rest_1");

    expect(result.id).toBe("rest_1");
    expect(result.createdAt).toBe(now.toISOString());
  });

  it("throws RESTAURANT_NOT_FOUND when it does not exist", async () => {
    mocked.findById.mockResolvedValue(null);

    await expect(
      restaurantService.getByIdOrThrow("nope"),
    ).rejects.toMatchObject({
      message: catalogErrors.RESTAURANT_NOT_FOUND.message,
      statusCode: catalogErrors.RESTAURANT_NOT_FOUND.statusCode,
    });
  });
});

describe("getMenus", () => {
  it("asserts the restaurant exists before listing its menus", async () => {
    mocked.findById.mockResolvedValue(null);

    await expect(restaurantService.getMenus("nope")).rejects.toBeInstanceOf(
      AppError,
    );
    expect(mockedMenus.listByRestaurant).not.toHaveBeenCalled();
  });

  it("returns the menus of an existing restaurant", async () => {
    const menus = [{ id: "menu_1" }];
    mocked.findById.mockResolvedValue(restaurantRow);
    mockedMenus.listByRestaurant.mockResolvedValue(
      menus as Awaited<ReturnType<typeof menuService.listByRestaurant>>,
    );

    const result = await restaurantService.getMenus("rest_1");

    expect(mockedMenus.listByRestaurant).toHaveBeenCalledWith("rest_1", false);
    expect(result).toEqual(menus);
  });

  it("reaches menus through a deleted restaurant when includeDeleted is set", async () => {
    mocked.findByIdIncludingDeleted.mockResolvedValue(deletedRow);
    mockedMenus.listByRestaurant.mockResolvedValue([]);

    await restaurantService.getMenus("rest_1", true);

    // The soft-delete-aware lookup, not the filtered one — otherwise a
    // cascaded delete would be a dead end for the admin.
    expect(mocked.findById).not.toHaveBeenCalled();
    expect(mockedMenus.listByRestaurant).toHaveBeenCalledWith("rest_1", true);
  });
});

describe("create", () => {
  it("creates the restaurant and stamps the actor on both auditing columns", async () => {
    mocked.create.mockResolvedValue(restaurantRow);

    const result = await restaurantService.create(
      { name: "Koshary El Tahrir" },
      ADMIN,
    );

    expect(mocked.create).toHaveBeenCalledWith({
      data: {
        name: "Koshary El Tahrir",
        createdBy: ADMIN,
        updatedBy: ADMIN,
      },
    });
    expect(result.name).toBe("Koshary El Tahrir");
  });
});

describe("update", () => {
  it("throws 404 when the restaurant does not exist", async () => {
    mocked.findById.mockResolvedValue(null);

    await expect(
      restaurantService.update("nope", { name: "New" }, ADMIN),
    ).rejects.toMatchObject({
      statusCode: catalogErrors.RESTAURANT_NOT_FOUND.statusCode,
    });
    expect(mocked.update).not.toHaveBeenCalled();
  });

  it("updates, stamps updatedBy, and leaves createdBy alone", async () => {
    mocked.findById.mockResolvedValue(restaurantRow);
    mocked.update.mockResolvedValue({ ...restaurantRow, name: "Renamed" });

    const result = await restaurantService.update(
      "rest_1",
      { name: "Renamed" },
      ADMIN,
    );

    expect(mocked.update).toHaveBeenCalledWith({
      where: { id: "rest_1" },
      data: { name: "Renamed", updatedBy: ADMIN },
    });
    expect(result.name).toBe("Renamed");
  });
});

describe("remove", () => {
  it("cascades the flag down to menus and items in one transaction", async () => {
    mocked.findById.mockResolvedValue(restaurantRow);
    mockedMenuRepo.findIdsByRestaurantId.mockResolvedValue([
      "menu_1",
      "menu_2",
    ]);

    await restaurantService.remove("rest_1", ADMIN);

    expect(mocked.transaction).toHaveBeenCalledTimes(1);
    expect(mockedItemRepo.softDeleteByMenuIds).toHaveBeenCalledWith(
      ["menu_1", "menu_2"],
      ADMIN,
      expect.anything(),
    );
    expect(mockedMenuRepo.softDeleteByRestaurantId).toHaveBeenCalledWith(
      "rest_1",
      ADMIN,
      expect.anything(),
    );
    expect(mocked.softDeleteById).toHaveBeenCalledWith(
      "rest_1",
      ADMIN,
      expect.anything(),
    );
  });

  it("drops the cached menu blobs — a cached menu outlives its rows", async () => {
    mocked.findById.mockResolvedValue(restaurantRow);
    mockedMenuRepo.findIdsByRestaurantId.mockResolvedValue([
      "menu_1",
      "menu_2",
    ]);

    await restaurantService.remove("rest_1", ADMIN);

    expect(mockedCache.del).toHaveBeenCalledWith("menu:menu_1", "menu:menu_2");
  });

  it("throws 404 without touching anything when the restaurant is gone", async () => {
    mocked.findById.mockResolvedValue(null);

    await expect(restaurantService.remove("nope", ADMIN)).rejects.toMatchObject(
      {
        statusCode: catalogErrors.RESTAURANT_NOT_FOUND.statusCode,
      },
    );
    expect(mocked.softDeleteById).not.toHaveBeenCalled();
  });
});

describe("restore", () => {
  it("brings the restaurant and its whole catalog back", async () => {
    mocked.findByIdIncludingDeleted.mockResolvedValue(deletedRow);
    mockedMenuRepo.findIdsByRestaurantId.mockResolvedValue(["menu_1"]);

    const result = await restaurantService.restore("rest_1", ADMIN);

    expect(mockedItemRepo.restoreByMenuIds).toHaveBeenCalledWith(
      ["menu_1"],
      ADMIN,
      expect.anything(),
    );
    expect(mockedMenuRepo.restoreByRestaurantId).toHaveBeenCalledWith(
      "rest_1",
      ADMIN,
      expect.anything(),
    );
    expect(mocked.restoreById).toHaveBeenCalledWith(
      "rest_1",
      ADMIN,
      expect.anything(),
    );
    expect(result.isDeleted).toBe(false);
  });

  it("throws 404 when the id matches nothing at all", async () => {
    mocked.findByIdIncludingDeleted.mockResolvedValue(null);

    await expect(
      restaurantService.restore("nope", ADMIN),
    ).rejects.toMatchObject({
      statusCode: catalogErrors.RESTAURANT_NOT_FOUND.statusCode,
    });
  });

  it("refuses to restore a restaurant that was never deleted", async () => {
    mocked.findByIdIncludingDeleted.mockResolvedValue(restaurantRow);

    await expect(
      restaurantService.restore("rest_1", ADMIN),
    ).rejects.toMatchObject({
      message: catalogErrors.NOT_DELETED.message,
      statusCode: catalogErrors.NOT_DELETED.statusCode,
    });
    expect(mocked.restoreById).not.toHaveBeenCalled();
  });
});
