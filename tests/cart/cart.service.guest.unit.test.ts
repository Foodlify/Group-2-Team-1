/**
 * Cart Service — guest cart + merge unit tests.
 *
 * The repositories are mocked so each test asserts pure service logic —
 * "IF the repository returns X, THEN the service does Y" — with no database.
 * `transaction` is stubbed to run the callback with a fake tx client, so the
 * merge flow's ordering is asserted without a real transaction.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/modules/cart/cart.repository", () => ({
  cartRepository: {
    transaction: vi.fn(),
    findByOwner: vi.fn(),
    findByOwnerWithItems: vi.fn(),
    createCart: vi.fn(),
    lockByOwner: vi.fn(),
    lockByOwnerWithItems: vi.fn(),
    deleteByOwner: vi.fn(),
    assignToCustomer: vi.fn(),
  },
}));

vi.mock("../../src/modules/cartItem/cartItem.repository", () => ({
  cartItemRepository: {
    findByCartAndMenuItem: vi.fn(),
    createWithTx: vi.fn(),
    updateWithTx: vi.fn(),
    findByIdWithCart: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../../src/modules/menuItem/menuItem.service", () => ({
  menuItemService: {
    findByIdWithMenu: vi.fn(),
  },
}));

import { cartService } from "../../src/modules/cart/cart.service";
import { cartRepository } from "../../src/modules/cart/cart.repository";
import { cartItemRepository } from "../../src/modules/cartItem/cartItem.repository";
import { menuItemService } from "../../src/modules/menuItem/menuItem.service";
import { cartErrors } from "../../src/shared/exceptions/cart.errors";
import { Prisma } from "../../src/generated/prisma/client";

const mockedCarts = vi.mocked(cartRepository);
const mockedItems = vi.mocked(cartItemRepository);
const mockedMenuItems = vi.mocked(menuItemService);

const tx = {} as never;
const now = new Date("2026-08-06T10:00:00.000Z");
// Prices are Decimal in the DB rows the repositories hand back.
const price30 = new Prisma.Decimal(30);

const guestCartRow = {
  id: "cart_guest",
  customerId: null,
  guestToken: "tok_abc",
  restaurantId: "rest_1",
  createdAt: now,
  updatedAt: now,
  cartItems: [
    {
      id: "ci_1",
      cartId: "cart_guest",
      menuItemId: "item_1",
      quantity: 2,
      price: price30,
      name: "Koshary",
      createdAt: now,
      updatedAt: now,
    },
  ],
};

const customerCartRow = {
  id: "cart_cust",
  customerId: "cust_1",
  guestToken: null,
  restaurantId: "rest_1",
  createdAt: now,
  updatedAt: now,
};

type CartWithItemsRow = Awaited<
  ReturnType<typeof cartRepository.lockByOwnerWithItems>
>;
type CartRow = Awaited<ReturnType<typeof cartRepository.findByOwner>>;

beforeEach(() => {
  vi.clearAllMocks();
  // Run transaction callbacks inline with a dummy tx client.
  mockedCarts.transaction.mockImplementation(
    async (cb: (client: never) => Promise<unknown>) => cb(tx),
  );
  mockedCarts.findByOwnerWithItems.mockResolvedValue(null);
});

describe("newGuestToken", () => {
  it("mints distinct, URL-safe tokens", () => {
    const a = cartService.newGuestToken();
    const b = cartService.newGuestToken();

    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{20,}$/);
  });
});

describe("addItem as a guest", () => {
  it("creates the cart keyed by the guest token, not a customer id", async () => {
    mockedMenuItems.findByIdWithMenu.mockResolvedValue({
      id: "item_1",
      name: "Koshary",
      price: "30",
      menu: { restaurantId: "rest_1" },
    } as never);
    mockedCarts.lockByOwner.mockResolvedValue(false);
    mockedCarts.createCart.mockResolvedValue(guestCartRow as never);
    mockedItems.findByCartAndMenuItem.mockResolvedValue(null);
    mockedCarts.findByOwnerWithItems.mockResolvedValue(
      guestCartRow as CartWithItemsRow,
    );

    const cart = await cartService.addItem(
      { guestToken: "tok_abc" },
      { menuItemId: "item_1", quantity: 2 },
    );

    expect(mockedCarts.createCart).toHaveBeenCalledWith(
      { guestToken: "tok_abc", restaurantId: "rest_1" },
      tx,
    );
    expect(cart.customerId).toBeNull();
  });
});

describe("mergeGuestCart", () => {
  it("hands the guest cart over when the customer has none", async () => {
    mockedCarts.lockByOwnerWithItems.mockResolvedValue(
      guestCartRow as CartWithItemsRow,
    );
    mockedCarts.lockByOwner.mockResolvedValue(false);

    await cartService.mergeGuestCart("cust_1", "tok_abc");

    expect(mockedCarts.assignToCustomer).toHaveBeenCalledWith(
      "cart_guest",
      "cust_1",
      tx,
    );
    // Nothing is copied and nothing is deleted — the same row changes hands.
    expect(mockedItems.createWithTx).not.toHaveBeenCalled();
    expect(mockedCarts.deleteByOwner).not.toHaveBeenCalled();
  });

  it("sums quantities per item when both carts share a restaurant", async () => {
    mockedCarts.lockByOwnerWithItems.mockResolvedValue(
      guestCartRow as CartWithItemsRow,
    );
    mockedCarts.lockByOwner.mockResolvedValue(true);
    mockedCarts.findByOwner.mockResolvedValue(customerCartRow as CartRow);
    mockedItems.findByCartAndMenuItem.mockResolvedValue({
      id: "ci_existing",
      quantity: 1,
    } as never);

    await cartService.mergeGuestCart("cust_1", "tok_abc");

    expect(mockedItems.updateWithTx).toHaveBeenCalledWith(
      { where: { id: "ci_existing" }, data: { quantity: 3 } },
      tx,
    );
    expect(mockedCarts.deleteByOwner).toHaveBeenCalledWith(
      { guestToken: "tok_abc" },
      tx,
    );
    expect(mockedCarts.assignToCustomer).not.toHaveBeenCalled();
  });

  it("copies items the customer's cart doesn't have yet", async () => {
    mockedCarts.lockByOwnerWithItems.mockResolvedValue(
      guestCartRow as CartWithItemsRow,
    );
    mockedCarts.lockByOwner.mockResolvedValue(true);
    mockedCarts.findByOwner.mockResolvedValue(customerCartRow as CartRow);
    mockedItems.findByCartAndMenuItem.mockResolvedValue(null);

    await cartService.mergeGuestCart("cust_1", "tok_abc");

    expect(mockedItems.createWithTx).toHaveBeenCalledWith(
      {
        data: {
          cartId: "cart_cust",
          menuItemId: "item_1",
          quantity: 2,
          // Price and name keep the guest cart's snapshot.
          name: "Koshary",
          price: price30,
        },
      },
      tx,
    );
  });

  it("refuses to merge carts from different restaurants", async () => {
    mockedCarts.lockByOwnerWithItems.mockResolvedValue(
      guestCartRow as CartWithItemsRow,
    );
    mockedCarts.lockByOwner.mockResolvedValue(true);
    mockedCarts.findByOwner.mockResolvedValue({
      ...customerCartRow,
      restaurantId: "rest_other",
    } as CartRow);

    await expect(
      cartService.mergeGuestCart("cust_1", "tok_abc"),
    ).rejects.toMatchObject({
      message: cartErrors.MERGE_DIFFERENT_RESTAURANT.message,
      statusCode: cartErrors.MERGE_DIFFERENT_RESTAURANT.statusCode,
    });
    expect(mockedCarts.deleteByOwner).not.toHaveBeenCalled();
  });

  it("is a no-op for an unknown or already-merged token", async () => {
    mockedCarts.lockByOwnerWithItems.mockResolvedValue(null);

    await cartService.mergeGuestCart("cust_1", "tok_gone");

    expect(mockedCarts.assignToCustomer).not.toHaveBeenCalled();
    expect(mockedItems.createWithTx).not.toHaveBeenCalled();
  });
});

describe("ownership checks", () => {
  it("lets a guest mutate an item in their own cart", async () => {
    mockedItems.findByIdWithCart.mockResolvedValue({
      id: "ci_1",
      cart: { customerId: null, guestToken: "tok_abc" },
    } as never);
    mockedCarts.findByOwnerWithItems.mockResolvedValue(
      guestCartRow as CartWithItemsRow,
    );

    await cartService.updateItem({ guestToken: "tok_abc" }, "ci_1", {
      quantity: 5,
    });

    expect(mockedItems.findByIdWithCart).toHaveBeenCalledWith("ci_1");
  });

  it("blocks a guest holding a different token (403)", async () => {
    mockedItems.findByIdWithCart.mockResolvedValue({
      id: "ci_1",
      cart: { customerId: null, guestToken: "tok_abc" },
    } as never);

    await expect(
      cartService.removeItem({ guestToken: "tok_other" }, "ci_1"),
    ).rejects.toMatchObject({
      statusCode: cartErrors.CART_ITEM_FORBIDDEN.statusCode,
    });
  });

  it("blocks a customer from touching a guest cart item (403)", async () => {
    mockedItems.findByIdWithCart.mockResolvedValue({
      id: "ci_1",
      cart: { customerId: null, guestToken: "tok_abc" },
    } as never);

    await expect(
      cartService.removeItem({ customerId: "cust_1" }, "ci_1"),
    ).rejects.toMatchObject({
      statusCode: cartErrors.CART_ITEM_FORBIDDEN.statusCode,
    });
  });
});
