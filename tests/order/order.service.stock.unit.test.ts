/**
 * Order Service — stock reservation unit tests.
 *
 * Every collaborator is mocked, and `transaction` runs its callback inline
 * with a fake tx client, so these assert the checkout/cancel logic itself:
 * what gets reserved, what gets released, and what blocks the order.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/modules/order/order.repository", () => ({
  orderRepository: {
    transaction: vi.fn(),
    createOrder: vi.fn(),
    findById: vi.fn(),
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
  cartService: {
    lockByOwnerWithItems: vi.fn(),
    clearCart: vi.fn(),
  },
}));

vi.mock("../../src/modules/menuItem/menuItem.service", () => ({
  menuItemService: {
    findManyByIds: vi.fn(),
    reserveStock: vi.fn(),
    releaseStock: vi.fn(),
  },
}));

vi.mock("../../src/modules/address/address.service", () => ({
  addressService: {
    findById: vi.fn(),
  },
}));

vi.mock("../../src/modules/payment/payment.service", () => ({
  paymentService: {
    processPayment: vi.fn(),
    // Cash has no gateway phase; armed in `beforeEach` to return nothing.
    initiatePayment: vi.fn(),
  },
}));

vi.mock("../../src/modules/transaction/transaction.service", () => ({
  transactionService: {
    refundOrderTransactions: vi.fn(),
    settleOrderTransactions: vi.fn(),
  },
}));

// Notifications are fire-and-forget side effects — mocked out so these tests
// stay about stock, and so no real mailer/DB lookup is attempted.
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
import { paymentService } from "../../src/modules/payment/payment.service";
import { addressService } from "../../src/modules/address/address.service";
import { orderErrors } from "../../src/shared/exceptions/order.errors";
import { Prisma } from "../../src/generated/prisma/client";

const mockedOrders = vi.mocked(orderRepository);
const mockedOrderItems = vi.mocked(orderItemRepository);
const mockedCart = vi.mocked(cartService);
const mockedMenuItems = vi.mocked(menuItemService);
const mockedAddresses = vi.mocked(addressService);

const tx = {} as never;
const now = new Date("2026-08-06T10:00:00.000Z");
const price30 = new Prisma.Decimal(30);

const cartWithTwoItems = {
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
      menuItemId: "item_tracked",
      quantity: 2,
      price: price30,
      name: "Koshary",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "ci_2",
      cartId: "cart_1",
      menuItemId: "item_untracked",
      quantity: 1,
      price: price30,
      name: "Water",
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
  totalAmount: new Prisma.Decimal(90),
  timeline: [],
  createdAt: now,
  updatedAt: now,
};

const placeOrderInput = {
  addressId: "addr_1",
  paymentMethod: "CASH" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  // Cash never reaches a gateway, so the post-commit phase returns nothing.
  vi.mocked(paymentService).initiatePayment.mockResolvedValue({});
  mockedOrders.transaction.mockImplementation(
    async (cb: (client: never) => Promise<unknown>) => cb(tx),
  );
  mockedAddresses.findById.mockResolvedValue({
    id: "addr_1",
    customerId: "cust_1",
  } as never);
  mockedCart.lockByOwnerWithItems.mockResolvedValue(cartWithTwoItems as never);
  mockedMenuItems.findManyByIds.mockResolvedValue([
    { id: "item_tracked", price: price30, stock: 5 },
    { id: "item_untracked", price: price30, stock: null },
  ] as never);
  mockedOrders.createOrder.mockResolvedValue(orderRow as never);
  mockedOrderItems.createManyWithTx.mockResolvedValue([] as never);
});

describe("placeOrder stock reservation", () => {
  it("reserves only the stock-tracked item, skipping untracked ones", async () => {
    mockedMenuItems.reserveStock.mockResolvedValue(true);

    await orderService.placeOrder("cust_1", placeOrderInput);

    expect(mockedMenuItems.reserveStock).toHaveBeenCalledTimes(1);
    expect(mockedMenuItems.reserveStock).toHaveBeenCalledWith(
      "item_tracked",
      2,
      tx,
    );
  });

  it("rejects the order with 409 when the reservation loses the race", async () => {
    // The conditional UPDATE matched zero rows — someone else took the units.
    mockedMenuItems.reserveStock.mockResolvedValue(false);

    await expect(
      orderService.placeOrder("cust_1", placeOrderInput),
    ).rejects.toMatchObject({
      message: orderErrors.OUT_OF_STOCK.message,
      statusCode: orderErrors.OUT_OF_STOCK.statusCode,
    });
    // The whole checkout is abandoned — no order row, no cart clearing.
    expect(mockedOrders.createOrder).not.toHaveBeenCalled();
    expect(mockedCart.clearCart).not.toHaveBeenCalled();
  });

  it("reserves before creating the order, so a failure rolls nothing forward", async () => {
    mockedMenuItems.reserveStock.mockResolvedValue(true);

    await orderService.placeOrder("cust_1", placeOrderInput);

    const reserveOrder =
      mockedMenuItems.reserveStock.mock.invocationCallOrder[0]!;
    const createOrderCall =
      mockedOrders.createOrder.mock.invocationCallOrder[0]!;
    expect(reserveOrder).toBeLessThan(createOrderCall);
  });
});

describe("cancelOrder stock release", () => {
  beforeEach(() => {
    mockedOrders.findById.mockResolvedValue(orderRow as never);
    mockedOrders.appendTimelineEntry.mockResolvedValue({
      status: "CANCELLED",
      timeline: [],
      updatedAt: now,
    } as never);
    mockedOrderItems.findManyByOrderIdWithTx.mockResolvedValue([
      {
        id: "oi_1",
        orderId: "order_1",
        menuItemId: "item_tracked",
        quantity: 2,
        price: price30,
        name: "Koshary",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "oi_2",
        orderId: "order_1",
        menuItemId: "item_untracked",
        quantity: 1,
        price: price30,
        name: "Water",
        createdAt: now,
        updatedAt: now,
      },
    ] as never);
  });

  it("puts every ordered quantity back", async () => {
    await orderService.cancelOrder("cust_1", "order_1");

    expect(mockedMenuItems.releaseStock).toHaveBeenCalledWith(
      "item_tracked",
      2,
      tx,
    );
    // Untracked items are filtered by the repository, so the call is harmless.
    expect(mockedMenuItems.releaseStock).toHaveBeenCalledWith(
      "item_untracked",
      1,
      tx,
    );
  });

  it("does not release stock when the order is not cancellable", async () => {
    // A null result means the status precondition (PENDING) didn't hold.
    mockedOrders.appendTimelineEntry.mockResolvedValue(null);

    await expect(
      orderService.cancelOrder("cust_1", "order_1"),
    ).rejects.toMatchObject({
      statusCode: orderErrors.ORDER_NOT_CANCELLABLE.statusCode,
    });
    expect(mockedMenuItems.releaseStock).not.toHaveBeenCalled();
  });
});
