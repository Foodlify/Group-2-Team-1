/**
 * Order Service — the checkout transaction.
 *
 * `placeOrder` is the one place where money, stock and the cart all move at
 * once, and its correctness rests on two things that are invisible from the
 * response: everything happens inside a single transaction with the *same*
 * client, and the cart is row-locked first so a concurrent "add to cart"
 * can't have its item silently dropped by the clear at the end.
 *
 * Neither is checkable by asserting on the returned order, so these assert on
 * the collaborators: who is called, with which transaction client, in what
 * order, and what stops when a step fails.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/modules/order/order.repository", () => ({
  orderRepository: {
    transaction: vi.fn(),
    createOrder: vi.fn(),
    findById: vi.fn(),
    findByIdWithDetails: vi.fn(),
    appendTimelineEntry: vi.fn(),
  },
}));

vi.mock("../../src/modules/orderItem/orderItem.repository", () => ({
  orderItemRepository: {
    createManyWithTx: vi.fn(),
    findManyByOrderIdWithTx: vi.fn(),
  },
}));

vi.mock("../../src/modules/cart/cart.service", () => ({
  cartService: { lockByOwnerWithItems: vi.fn(), clearCart: vi.fn() },
}));

vi.mock("../../src/modules/menuItem/menuItem.service", () => ({
  menuItemService: {
    findManyByIds: vi.fn(),
    reserveStock: vi.fn(),
    releaseStock: vi.fn(),
  },
}));

vi.mock("../../src/modules/address/address.service", () => ({
  addressService: { findById: vi.fn() },
}));

vi.mock("../../src/modules/payment/payment.service", () => ({
  paymentService: { processPayment: vi.fn() },
}));

vi.mock("../../src/modules/transaction/transaction.service", () => ({
  transactionService: {
    refundOrderTransactions: vi.fn(),
    settleOrderTransactions: vi.fn(),
  },
}));

vi.mock("../../src/modules/notification/notification.service", () => ({
  notificationService: {
    notifyOrderPlaced: vi.fn(),
    notifyOrderStatusChanged: vi.fn(),
  },
}));

import { orderService } from "../../src/modules/order/order.service";
import { orderRepository } from "../../src/modules/order/order.repository";
import { orderItemRepository } from "../../src/modules/orderItem/orderItem.repository";
import { cartService } from "../../src/modules/cart/cart.service";
import { menuItemService } from "../../src/modules/menuItem/menuItem.service";
import { addressService } from "../../src/modules/address/address.service";
import { paymentService } from "../../src/modules/payment/payment.service";
import { notificationService } from "../../src/modules/notification/notification.service";
import { orderErrors } from "../../src/shared/exceptions/order.errors";
import { Prisma } from "../../src/generated/prisma/client";

const mockedOrders = vi.mocked(orderRepository);
const mockedOrderItems = vi.mocked(orderItemRepository);
const mockedCart = vi.mocked(cartService);
const mockedMenuItems = vi.mocked(menuItemService);
const mockedAddresses = vi.mocked(addressService);
const mockedPayment = vi.mocked(paymentService);
const mockedNotifications = vi.mocked(notificationService);

/** A recognisable stand-in for the Prisma transaction client. */
const tx = { __brand: "tx" } as never;
const now = new Date("2026-08-06T10:00:00.000Z");
const price30 = new Prisma.Decimal(30);
const input = { addressId: "addr_1", paymentMethod: "CASH" as const };

const cart = {
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
      price: price30,
      name: "Koshary",
      createdAt: now,
      updatedAt: now,
    },
  ],
};

const orderRow = {
  id: "order_1",
  customerId: "cust_1",
  addressId: "addr_1",
  restaurantId: "rest_1",
  orderDate: now,
  status: "PENDING",
  totalAmount: new Prisma.Decimal(60),
  timeline: [],
  createdAt: now,
  updatedAt: now,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedOrders.transaction.mockImplementation(
    async (cb: (client: never) => Promise<unknown>) => cb(tx),
  );
  mockedAddresses.findById.mockResolvedValue({
    id: "addr_1",
    customerId: "cust_1",
  } as never);
  mockedCart.lockByOwnerWithItems.mockResolvedValue(cart as never);
  mockedMenuItems.findManyByIds.mockResolvedValue([
    { id: "item_1", price: price30, stock: null },
  ] as never);
  mockedOrders.createOrder.mockResolvedValue(orderRow as never);
  mockedOrderItems.createManyWithTx.mockResolvedValue([] as never);
  // Re-armed every test on purpose: `clearAllMocks` resets recorded calls but
  // NOT implementations, so the `mockRejectedValue` used by the payment-failure
  // test below would otherwise leak into every test that follows it.
  mockedPayment.processPayment.mockResolvedValue(undefined as never);
});

describe("the cart is locked before anything is read from it", () => {
  it("locks by owner using the transaction client", async () => {
    await orderService.placeOrder("cust_1", input);

    // Passing the tx is the whole point: the row lock has to be held by the
    // same transaction that later clears the cart, or a concurrent add-to-cart
    // slips in between and its item is lost.
    expect(mockedCart.lockByOwnerWithItems).toHaveBeenCalledWith(
      { customerId: "cust_1" },
      tx,
    );
  });

  it("locks before reading the menu prices and reserving stock", async () => {
    mockedMenuItems.reserveStock.mockResolvedValue(true);
    mockedMenuItems.findManyByIds.mockResolvedValue([
      { id: "item_1", price: price30, stock: 5 },
    ] as never);

    await orderService.placeOrder("cust_1", input);

    const lock = mockedCart.lockByOwnerWithItems.mock.invocationCallOrder[0]!;
    const read = mockedMenuItems.findManyByIds.mock.invocationCallOrder[0]!;
    const reserve = mockedMenuItems.reserveStock.mock.invocationCallOrder[0]!;
    expect(lock).toBeLessThan(read);
    expect(read).toBeLessThan(reserve);
  });

  it("404s when there is no cart to lock", async () => {
    mockedCart.lockByOwnerWithItems.mockResolvedValue(null);

    await expect(
      orderService.placeOrder("cust_1", input),
    ).rejects.toMatchObject({
      message: orderErrors.CART_NOT_FOUND.message,
      statusCode: orderErrors.CART_NOT_FOUND.statusCode,
    });
    expect(mockedOrders.createOrder).not.toHaveBeenCalled();
  });

  it("refuses an empty cart", async () => {
    mockedCart.lockByOwnerWithItems.mockResolvedValue({
      ...cart,
      cartItems: [],
    } as never);

    await expect(
      orderService.placeOrder("cust_1", input),
    ).rejects.toMatchObject({
      message: orderErrors.CART_EMPTY.message,
      statusCode: orderErrors.CART_EMPTY.statusCode,
    });
  });
});

describe("the address is validated before the transaction opens", () => {
  it("checks ownership first, so a bad address never starts a transaction", async () => {
    await orderService.placeOrder("cust_1", input);

    const check = mockedAddresses.findById.mock.invocationCallOrder[0]!;
    const openTx = mockedOrders.transaction.mock.invocationCallOrder[0]!;
    expect(check).toBeLessThan(openTx);
  });

  it("404s an unknown address without opening a transaction", async () => {
    mockedAddresses.findById.mockResolvedValue(null);

    await expect(
      orderService.placeOrder("cust_1", input),
    ).rejects.toMatchObject({
      statusCode: orderErrors.ADDRESS_NOT_FOUND.statusCode,
    });
    expect(mockedOrders.transaction).not.toHaveBeenCalled();
  });

  it("403s someone else's address", async () => {
    mockedAddresses.findById.mockResolvedValue({
      id: "addr_1",
      customerId: "someone_else",
    } as never);

    await expect(
      orderService.placeOrder("cust_1", input),
    ).rejects.toMatchObject({
      statusCode: orderErrors.ADDRESS_FORBIDDEN.statusCode,
    });
    expect(mockedOrders.transaction).not.toHaveBeenCalled();
  });
});

describe("everything inside runs on one transaction client", () => {
  it("hands the same tx to every write", async () => {
    await orderService.placeOrder("cust_1", input);

    // If any of these got the plain client instead, that write would commit
    // independently and a later failure would leave the data half-applied.
    expect(mockedCart.lockByOwnerWithItems).toHaveBeenCalledWith(
      expect.anything(),
      tx,
    );
    expect(mockedOrders.createOrder).toHaveBeenCalledWith(
      expect.anything(),
      tx,
    );
    expect(mockedOrderItems.createManyWithTx).toHaveBeenCalledWith(
      expect.anything(),
      tx,
    );
    expect(mockedPayment.processPayment).toHaveBeenCalledWith(
      "CASH",
      expect.any(Number),
      expect.anything(),
      tx,
    );
    expect(mockedCart.clearCart).toHaveBeenCalledWith(
      { customerId: "cust_1" },
      tx,
    );
  });

  it("runs the steps in the only safe order", async () => {
    await orderService.placeOrder("cust_1", input);

    const order = [
      mockedCart.lockByOwnerWithItems.mock.invocationCallOrder[0]!,
      mockedOrders.createOrder.mock.invocationCallOrder[0]!,
      mockedOrderItems.createManyWithTx.mock.invocationCallOrder[0]!,
      mockedPayment.processPayment.mock.invocationCallOrder[0]!,
      mockedCart.clearCart.mock.invocationCallOrder[0]!,
    ];
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("leaves the cart alone when payment fails", async () => {
    mockedPayment.processPayment.mockRejectedValue(new Error("gateway down"));

    await expect(orderService.placeOrder("cust_1", input)).rejects.toThrow(
      "gateway down",
    );
    // The transaction would roll the rest back; the cart must not have been
    // cleared as a separate, already-committed action.
    expect(mockedCart.clearCart).not.toHaveBeenCalled();
  });

  it("rejects a cart line whose menu item has disappeared", async () => {
    mockedMenuItems.findManyByIds.mockResolvedValue([] as never);

    await expect(
      orderService.placeOrder("cust_1", input),
    ).rejects.toMatchObject({
      message: orderErrors.MENU_ITEM_UNAVAILABLE.message,
      statusCode: orderErrors.MENU_ITEM_UNAVAILABLE.statusCode,
    });
    expect(mockedOrders.createOrder).not.toHaveBeenCalled();
  });
});

describe("after the commit", () => {
  it("notifies the customer only once the transaction has finished", async () => {
    await orderService.placeOrder("cust_1", input);

    const clear = mockedCart.clearCart.mock.invocationCallOrder[0]!;
    const notify =
      mockedNotifications.notifyOrderPlaced.mock.invocationCallOrder[0]!;
    expect(clear).toBeLessThan(notify);
  });

  it("sends no notification at all when the checkout throws", async () => {
    mockedCart.lockByOwnerWithItems.mockResolvedValue(null);

    await expect(orderService.placeOrder("cust_1", input)).rejects.toThrow();

    expect(mockedNotifications.notifyOrderPlaced).not.toHaveBeenCalled();
  });

  it("builds the response in memory, without re-reading the order", async () => {
    const result = await orderService.placeOrder("cust_1", input);

    expect(result.id).toBe("order_1");
    expect(mockedOrders.findByIdWithDetails).not.toHaveBeenCalled();
  });
});
