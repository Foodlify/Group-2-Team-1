import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/shared/cache/cache", () => ({
  cache: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    delByPrefix: vi.fn(),
  },
  cacheKeys: {
    cartOfCustomer: (customerId: string) => `cart:customer:${customerId}`,
    cartOfGuest: (guestToken: string) => `cart:guest:${guestToken}`,
    menu: (menuId: string) => `menu:${menuId}`,
    menusPrefix: "menu:",
  },
}));

vi.mock("../../src/modules/cart/cart.repository", () => ({
  cartRepository: {
    findByOwnerWithItems: vi.fn(),
    deleteByOwner: vi.fn(),
    transaction: vi.fn(),
  },
}));

vi.mock("../../src/modules/cartItem/cartItem.repository", () => ({
  cartItemRepository: {
    findByIdWithCart: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../../src/modules/menuItem/menuItem.service", () => ({
  menuItemService: { findByIdWithMenu: vi.fn() },
}));

import { cartService } from "../../src/modules/cart/cart.service";
import { cartRepository } from "../../src/modules/cart/cart.repository";
import { cartItemRepository } from "../../src/modules/cartItem/cartItem.repository";
import { cache } from "../../src/shared/cache/cache";
import { Prisma } from "../../src/generated/prisma/client";

const mockedCache = vi.mocked(cache);
const mockedCarts = vi.mocked(cartRepository);
const mockedItems = vi.mocked(cartItemRepository);

const now = new Date("2026-08-06T10:00:00.000Z");
const cartRow = {
  id: "cart_1",
  customerId: "cust_1",
  guestToken: null,
  restaurantId: "rest_1",
  createdAt: now,
  updatedAt: now,
  cartItems: [
    {
      id: "ci_1",
      cartId: "cart_1",
      menuItemId: "item_1",
      quantity: 2,
      price: new Prisma.Decimal(30),
      name: "Koshary",
      createdAt: now,
      updatedAt: now,
    },
  ],
};

type CartWithItemsRow = Awaited<
  ReturnType<typeof cartRepository.findByOwnerWithItems>
>;

beforeEach(() => {
  vi.clearAllMocks();
  mockedCache.get.mockResolvedValue(null);
  mockedCarts.findByOwnerWithItems.mockResolvedValue(
    cartRow as CartWithItemsRow,
  );
});

describe("getMyCart caching", () => {
  it("serves a hit without touching the database", async () => {
    const cached = { id: "cart_1", totalPrice: 60 };
    mockedCache.get.mockResolvedValue(cached);

    const result = await cartService.getMyCart({ customerId: "cust_1" });

    expect(result).toBe(cached);
    expect(mockedCarts.findByOwnerWithItems).not.toHaveBeenCalled();
  });

  it("populates the cache on a miss", async () => {
    const result = await cartService.getMyCart({ customerId: "cust_1" });

    expect(mockedCache.get).toHaveBeenCalledWith("cart:customer:cust_1");
    expect(mockedCache.set).toHaveBeenCalledWith(
      "cart:customer:cust_1",
      result,
    );
  });

  it("keys guest carts by their token, not a customer id", async () => {
    await cartService.getMyCart({ guestToken: "tok_abc" });

    expect(mockedCache.get).toHaveBeenCalledWith("cart:guest:tok_abc");
  });

  it("caches nothing when there is no cart", async () => {
    mockedCarts.findByOwnerWithItems.mockResolvedValue(null);

    const result = await cartService.getMyCart({ customerId: "cust_1" });

    expect(result).toBeNull();
    expect(mockedCache.set).not.toHaveBeenCalled();
  });
});

describe("invalidation on mutation", () => {
  it("drops the key before rebuilding the response", async () => {
    mockedItems.findByIdWithCart.mockResolvedValue({
      id: "ci_1",
      cart: { customerId: "cust_1", guestToken: null },
    } as never);

    await cartService.updateItem({ customerId: "cust_1" }, "ci_1", {
      quantity: 5,
    });

    expect(mockedCache.del).toHaveBeenCalledWith("cart:customer:cust_1");

    const delCall = mockedCache.del.mock.invocationCallOrder[0]!;
    const readCall =
      mockedCarts.findByOwnerWithItems.mock.invocationCallOrder[0]!;
    expect(delCall).toBeLessThan(readCall);
  });

  it("drops the key when the cart is cleared at checkout", async () => {
    await cartService.clearCart({ customerId: "cust_1" });

    expect(mockedCache.del).toHaveBeenCalledWith("cart:customer:cust_1");
  });

  it("drops the item's key on removal", async () => {
    mockedItems.findByIdWithCart.mockResolvedValue({
      id: "ci_1",
      cart: { customerId: null, guestToken: "tok_abc" },
    } as never);

    await cartService.removeItem({ guestToken: "tok_abc" }, "ci_1");

    expect(mockedCache.del).toHaveBeenCalledWith("cart:guest:tok_abc");
  });
});
