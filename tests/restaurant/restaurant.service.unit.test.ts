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
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../../src/modules/menu/menu.service", () => ({
  menuService: {
    listByRestaurant: vi.fn(),
  },
}));

import { restaurantService } from "../../src/modules/restaurant/restaurant.service";
import { restaurantRepository } from "../../src/modules/restaurant/restaurant.repository";
import { menuService } from "../../src/modules/menu/menu.service";
import { AppError } from "../../src/middlewares/error.middleware";
import { catalogErrors } from "../../src/shared/exceptions/catalog.errors";

const mocked = vi.mocked(restaurantRepository);
const mockedMenus = vi.mocked(menuService);

const now = new Date("2026-08-06T10:00:00.000Z");
const restaurantRow = {
  id: "rest_1",
  name: "Koshary El Tahrir",
  createdAt: now,
  updatedAt: now,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("list", () => {
  it("maps rows to responses and passes pagination meta through", async () => {
    const meta = { page: 1, limit: 20, total: 1, totalPages: 1 };
    mocked.listPaginated.mockResolvedValue({ data: [restaurantRow], meta });

    const result = await restaurantService.list({ page: 1, limit: 20 });

    expect(mocked.listPaginated).toHaveBeenCalledWith(1, 20, undefined);
    expect(result.meta).toEqual(meta);
    expect(result.data).toEqual([
      {
        id: "rest_1",
        name: "Koshary El Tahrir",
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    ]);
  });

  it("forwards the search term to the repository", async () => {
    mocked.listPaginated.mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });

    await restaurantService.list({ page: 1, limit: 20, search: "koshary" });

    expect(mocked.listPaginated).toHaveBeenCalledWith(1, 20, "koshary");
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

    expect(mockedMenus.listByRestaurant).toHaveBeenCalledWith("rest_1");
    expect(result).toEqual(menus);
  });
});

describe("create", () => {
  it("creates the restaurant and returns the mapped response", async () => {
    mocked.create.mockResolvedValue(restaurantRow);

    const result = await restaurantService.create({
      name: "Koshary El Tahrir",
    });

    expect(mocked.create).toHaveBeenCalledWith({
      data: { name: "Koshary El Tahrir" },
    });
    expect(result.name).toBe("Koshary El Tahrir");
  });
});

describe("update", () => {
  it("throws 404 when the restaurant does not exist", async () => {
    mocked.findById.mockResolvedValue(null);

    await expect(
      restaurantService.update("nope", { name: "New" }),
    ).rejects.toMatchObject({
      statusCode: catalogErrors.RESTAURANT_NOT_FOUND.statusCode,
    });
    expect(mocked.update).not.toHaveBeenCalled();
  });

  it("updates and returns the mapped restaurant", async () => {
    mocked.findById.mockResolvedValue(restaurantRow);
    mocked.update.mockResolvedValue({ ...restaurantRow, name: "Renamed" });

    const result = await restaurantService.update("rest_1", {
      name: "Renamed",
    });

    expect(mocked.update).toHaveBeenCalledWith({
      where: { id: "rest_1" },
      data: { name: "Renamed" },
    });
    expect(result.name).toBe("Renamed");
  });
});

describe("remove", () => {
  it("deletes an existing, unreferenced restaurant", async () => {
    mocked.findById.mockResolvedValue(restaurantRow);
    mocked.delete.mockResolvedValue(restaurantRow);

    await restaurantService.remove("rest_1");

    expect(mocked.delete).toHaveBeenCalledWith({ where: { id: "rest_1" } });
  });

  it("translates a foreign-key violation into RESOURCE_IN_USE (409)", async () => {
    mocked.findById.mockResolvedValue(restaurantRow);
    // Shape matched by `isForeignKeyViolation` (Prisma P2003).
    mocked.delete.mockRejectedValue({ code: "P2003" });

    await expect(restaurantService.remove("rest_1")).rejects.toMatchObject({
      message: catalogErrors.RESOURCE_IN_USE.message,
      statusCode: catalogErrors.RESOURCE_IN_USE.statusCode,
    });
  });

  it("rethrows unexpected repository errors untouched", async () => {
    mocked.findById.mockResolvedValue(restaurantRow);
    const boom = new Error("connection reset");
    mocked.delete.mockRejectedValue(boom);

    await expect(restaurantService.remove("rest_1")).rejects.toBe(boom);
  });
});
