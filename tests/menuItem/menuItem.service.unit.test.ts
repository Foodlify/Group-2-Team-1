import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/modules/menuItem/menuItem.repository", () => ({
  menuItemRepository: {
    searchPaginated: vi.fn(),
  },
}));

vi.mock("../../src/modules/menu/menu.repository", () => ({
  menuRepository: {
    findById: vi.fn(),
  },
}));

import { menuItemService } from "../../src/modules/menuItem/menuItem.service";
import { menuItemRepository } from "../../src/modules/menuItem/menuItem.repository";

const mocked = vi.mocked(menuItemRepository);

const now = new Date("2026-08-06T10:00:00.000Z");
const searchRow = {
  id: "item_1",
  menuId: "menu_1",
  name: "Margherita Pizza",
  price: "12.99",
  createdAt: now,
  updatedAt: now,
  menu: {
    id: "menu_1",
    name: "Dinner",
    restaurant: { id: "rest_1", name: "Pizza Palace" },
  },
} as unknown as Awaited<
  ReturnType<typeof menuItemRepository.searchPaginated>
>["data"][number];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("search", () => {
  it("forwards pagination + search term and flattens menu/restaurant context", async () => {
    const meta = { page: 1, limit: 20, total: 1, totalPages: 1 };
    mocked.searchPaginated.mockResolvedValue({ data: [searchRow], meta });

    const result = await menuItemService.search({
      page: 1,
      limit: 20,
      search: "pizza",
    });

    expect(mocked.searchPaginated).toHaveBeenCalledWith(1, 20, "pizza");
    expect(result.meta).toEqual(meta);
    expect(result.data).toEqual([
      {
        id: "item_1",
        name: "Margherita Pizza",
        price: 12.99,
        menu: { id: "menu_1", name: "Dinner" },
        restaurant: { id: "rest_1", name: "Pizza Palace" },
      },
    ]);
  });

  it("works without a search term (browse mode)", async () => {
    mocked.searchPaginated.mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });

    const result = await menuItemService.search({ page: 1, limit: 20 });

    expect(mocked.searchPaginated).toHaveBeenCalledWith(1, 20, undefined);
    expect(result.data).toEqual([]);
  });
});
