/**
 * Order Service — the gateway hand-off after checkout commits.
 *
 * A card order commits with stock already reserved and a payment that has not
 * happened yet. That leaves one dangerous window: if creating the checkout
 * session fails, there is a committed order holding units nobody can buy and a
 * customer with no way to pay. These tests pin the cleanup.
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
  paymentService: { processPayment: vi.fn(), initiatePayment: vi.fn() },
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
import { transactionService } from "../../src/modules/transaction/transaction.service";
import { notificationService } from "../../src/modules/notification/notification.service";
import { paymentErrors } from "../../src/shared/exceptions/payment.errors";
import { Prisma } from "../../src/generated/prisma/client";

const mockedOrders = vi.mocked(orderRepository);
const mockedOrderItems = vi.mocked(orderItemRepository);
const mockedCart = vi.mocked(cartService);
const mockedMenuItems = vi.mocked(menuItemService);
const mockedAddresses = vi.mocked(addressService);
const mockedPayment = vi.mocked(paymentService);
const mockedTransactions = vi.mocked(transactionService);
const mockedNotifications = vi.mocked(notificationService);

const tx = { __brand: "tx" } as never;
const now = new Date("2026-08-09T10:00:00.000Z");
const price30 = new Prisma.Decimal(30);
const cardInput = {
  addressId: "addr_1",
  paymentMethod: "CREDIT_CARD" as const,
};

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
    { id: "item_1", price: price30, stock: 10 },
  ] as never);
  mockedMenuItems.reserveStock.mockResolvedValue(true);
  mockedOrders.createOrder.mockResolvedValue(orderRow as never);
  mockedOrderItems.createManyWithTx.mockResolvedValue([] as never);
  mockedOrderItems.findManyByOrderIdWithTx.mockResolvedValue([
    { menuItemId: "item_1", quantity: 2 },
  ] as never);
  mockedOrders.findById.mockResolvedValue(orderRow as never);
  mockedOrders.appendTimelineEntry.mockResolvedValue({
    status: "CANCELLED",
    timeline: [],
    updatedAt: now,
  } as never);
  // Re-armed each test: `clearAllMocks` clears calls, not implementations, so
  // the rejection used below would otherwise leak into every later test.
  mockedPayment.processPayment.mockResolvedValue({ id: "txn_1" } as never);
  mockedPayment.initiatePayment.mockResolvedValue({
    externalRef: "cs_test_1",
    redirectUrl: "https://checkout.stripe.com/c/pay/cs_test_1",
  });
});

describe("a card order returns the URL the customer must visit", () => {
  it("surfaces the gateway's redirect on the response", async () => {
    const result = await orderService.placeOrder("cust_1", cardInput);

    expect(result.paymentUrl).toBe(
      "https://checkout.stripe.com/c/pay/cs_test_1",
    );
  });

  it("leaves the order PENDING — the redirect is not payment", async () => {
    const result = await orderService.placeOrder("cust_1", cardInput);

    // Being handed a checkout URL says nothing about money moving. Only the
    // webhook may confirm the order.
    expect(result.status).toBe("PENDING");
  });

  it("hands the gateway the recorded transaction and the exact total", async () => {
    await orderService.placeOrder("cust_1", cardInput);

    expect(mockedPayment.initiatePayment).toHaveBeenCalledWith(
      "CREDIT_CARD",
      { id: "txn_1" },
      60,
      expect.objectContaining({ orderId: "order_1", currency: "EGP" }),
    );
  });

  it("reserves the stock before the customer is sent to pay", async () => {
    await orderService.placeOrder("cust_1", cardInput);

    // The alternative — reserve on payment success — lets 500 people pay for
    // 50 units and disappoints 450 of them after taking their money.
    const reserve = mockedMenuItems.reserveStock.mock.invocationCallOrder[0]!;
    const initiate = mockedPayment.initiatePayment.mock.invocationCallOrder[0]!;
    expect(reserve).toBeLessThan(initiate);
  });
});

describe("when the gateway hand-off fails", () => {
  beforeEach(() => {
    mockedPayment.initiatePayment.mockRejectedValue(new Error("stripe down"));
  });

  it("cancels the committed order", async () => {
    await expect(
      orderService.placeOrder("cust_1", cardInput),
    ).rejects.toThrow();

    // The transaction already committed, so a rollback is not available —
    // the order has to be actively cancelled.
    expect(mockedOrders.appendTimelineEntry).toHaveBeenCalledWith(
      "order_1",
      expect.objectContaining({ status: "CANCELLED" }),
      "PENDING",
      tx,
    );
  });

  it("puts the reserved units back on the shelf", async () => {
    await expect(
      orderService.placeOrder("cust_1", cardInput),
    ).rejects.toThrow();

    // Without this the stock is held hostage by an order nobody can pay for.
    expect(mockedMenuItems.releaseStock).toHaveBeenCalledWith("item_1", 2, tx);
  });

  it("marks the pending payment FAILED", async () => {
    await expect(
      orderService.placeOrder("cust_1", cardInput),
    ).rejects.toThrow();

    expect(mockedTransactions.refundOrderTransactions).toHaveBeenCalledWith(
      "order_1",
      tx,
    );
  });

  it("answers 402 rather than a generic 500", async () => {
    await expect(
      orderService.placeOrder("cust_1", cardInput),
    ).rejects.toMatchObject({
      message: paymentErrors.PAYMENT_FAILED.message,
      statusCode: paymentErrors.PAYMENT_FAILED.statusCode,
    });
  });

  it("never tells the customer the order was placed", async () => {
    await expect(
      orderService.placeOrder("cust_1", cardInput),
    ).rejects.toThrow();

    expect(mockedNotifications.notifyOrderPlaced).not.toHaveBeenCalled();
  });

  it("still reports the payment error when the cleanup itself fails", async () => {
    // Cancellation lost the race — the order was already moved on.
    mockedOrders.appendTimelineEntry.mockResolvedValue(null as never);

    // The customer must get the payment error either way; hiding it behind a
    // cleanup failure tells them nothing about what went wrong.
    await expect(
      orderService.placeOrder("cust_1", cardInput),
    ).rejects.toMatchObject({
      statusCode: paymentErrors.PAYMENT_FAILED.statusCode,
    });
  });
});
