/**
 * Order Service — money arithmetic.
 *
 * Every amount the API reports has to be exact. Binary floats are not: at the
 * prices this app actually charges, `8.15 * 3` is 24.450000000000003 and
 * `29.99 * 7` is 209.92999999999998. The values below are chosen precisely
 * because they break under float multiplication — with `Prisma.Decimal` they
 * come out right, so these tests fail the moment someone reaches for `*`.
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
import { orderErrors } from "../../src/shared/exceptions/order.errors";
import { Prisma } from "../../src/generated/prisma/client";

const mockedOrders = vi.mocked(orderRepository);
const mockedOrderItems = vi.mocked(orderItemRepository);
const mockedCart = vi.mocked(cartService);
const mockedMenuItems = vi.mocked(menuItemService);
const mockedAddresses = vi.mocked(addressService);
const mockedPayment = vi.mocked(paymentService);

const tx = {} as never;
const now = new Date("2026-08-06T10:00:00.000Z");
const input = { addressId: "addr_1", paymentMethod: "CASH" as const };

/** A cart line whose price × quantity is wrong in float arithmetic. */
const cartLine = (id: string, price: string, quantity: number) => ({
  id,
  cartId: "cart_1",
  menuItemId: `item_${id}`,
  quantity,
  price: new Prisma.Decimal(price),
  name: `Item ${id}`,
  createdAt: now,
  updatedAt: now,
});

const orderLine = (id: string, price: string, quantity: number) => ({
  id: `oi_${id}`,
  orderId: "order_1",
  menuItemId: `item_${id}`,
  quantity,
  price: new Prisma.Decimal(price),
  name: `Item ${id}`,
  createdAt: now,
  updatedAt: now,
});

const cartWith = (lines: ReturnType<typeof cartLine>[]) => ({
  id: "cart_1",
  customerId: "cust_1",
  guestToken: null,
  restaurantId: "rest_1",
  createdAt: now,
  updatedAt: now,
  cartItems: lines,
});

/** Whatever `createOrder` was called with, echoed back as the persisted row. */
const echoCreatedOrder = () => {
  mockedOrders.createOrder.mockImplementation(
    async (data: { totalAmount: Prisma.Decimal | number }) =>
      ({
        id: "order_1",
        customerId: "cust_1",
        addressId: "addr_1",
        restaurantId: "rest_1",
        orderDate: now,
        status: "PENDING",
        totalAmount: data.totalAmount,
        timeline: [],
        createdAt: now,
        updatedAt: now,
      }) as never,
  );
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
  mockedMenuItems.reserveStock.mockResolvedValue(true);
  mockedOrderItems.createManyWithTx.mockResolvedValue([] as never);
  echoCreatedOrder();
});

describe("order total", () => {
  it("is exact for prices that float multiplication gets wrong", async () => {
    // 8.15 * 3 = 24.450000000000003 in float. 29.99 * 7 = 209.92999999999998.
    // Together: 234.38 exactly, or 234.38000000000002 the wrong way.
    mockedCart.lockByOwnerWithItems.mockResolvedValue(
      cartWith([cartLine("a", "8.15", 3), cartLine("b", "29.99", 7)]) as never,
    );
    mockedMenuItems.findManyByIds.mockResolvedValue([
      { id: "item_a", price: new Prisma.Decimal("8.15"), stock: null },
      { id: "item_b", price: new Prisma.Decimal("29.99"), stock: null },
    ] as never);

    const result = await orderService.placeOrder("cust_1", input);

    expect(result.totalPrice).toBe(234.38);
  });

  it("is accumulated as a Decimal, not a JS number", async () => {
    mockedCart.lockByOwnerWithItems.mockResolvedValue(
      cartWith([cartLine("a", "0.1", 3)]) as never,
    );
    mockedMenuItems.findManyByIds.mockResolvedValue([
      { id: "item_a", price: new Prisma.Decimal("0.1"), stock: null },
    ] as never);

    await orderService.placeOrder("cust_1", input);

    const [data] = mockedOrders.createOrder.mock.calls[0]!;
    // The type matters: handing Prisma a float here would persist the drift.
    expect(Prisma.Decimal.isDecimal(data.totalAmount)).toBe(true);
    expect((data.totalAmount as Prisma.Decimal).toString()).toBe("0.3");
  });

  it("charges the payment gateway exactly what the order says", async () => {
    mockedCart.lockByOwnerWithItems.mockResolvedValue(
      cartWith([cartLine("a", "1.10", 3)]) as never,
    );
    mockedMenuItems.findManyByIds.mockResolvedValue([
      { id: "item_a", price: new Prisma.Decimal("1.10"), stock: null },
    ] as never);

    const result = await orderService.placeOrder("cust_1", input);

    // 1.1 * 3 = 3.3000000000000003 in float — the customer must not be
    // charged a different number from the one shown on the order.
    expect(mockedPayment.processPayment).toHaveBeenCalledWith(
      "CASH",
      3.3,
      expect.objectContaining({ orderId: "order_1", currency: "EGP" }),
      tx,
    );
    expect(result.totalPrice).toBe(3.3);
  });

  it("totals an empty-priced edge case without drift across many lines", async () => {
    // 11 lines of 0.07 — float summation drifts, Decimal doesn't.
    const lines = Array.from({ length: 11 }, (_, i) =>
      cartLine(`l${i}`, "0.07", 1),
    );
    mockedCart.lockByOwnerWithItems.mockResolvedValue(cartWith(lines) as never);
    mockedMenuItems.findManyByIds.mockResolvedValue(
      lines.map((l) => ({
        id: l.menuItemId,
        price: new Prisma.Decimal("0.07"),
        stock: null,
      })) as never,
    );

    const result = await orderService.placeOrder("cust_1", input);

    expect(result.totalPrice).toBe(0.77);
  });
});

describe("line subtotals", () => {
  it("are exact for prices that float multiplication gets wrong", async () => {
    mockedCart.lockByOwnerWithItems.mockResolvedValue(
      cartWith([cartLine("a", "8.15", 3)]) as never,
    );
    mockedMenuItems.findManyByIds.mockResolvedValue([
      { id: "item_a", price: new Prisma.Decimal("8.15"), stock: null },
    ] as never);
    mockedOrderItems.createManyWithTx.mockResolvedValue([
      orderLine("a", "8.15", 3),
    ] as never);

    const result = await orderService.placeOrder("cust_1", input);

    // Was 24.450000000000003 before the Decimal fix.
    expect(result.items[0]!.subtotal).toBe(24.45);
  });

  it("add up to exactly the order total", async () => {
    const lines = [cartLine("a", "8.15", 3), cartLine("b", "29.99", 7)];
    mockedCart.lockByOwnerWithItems.mockResolvedValue(cartWith(lines) as never);
    mockedMenuItems.findManyByIds.mockResolvedValue([
      { id: "item_a", price: new Prisma.Decimal("8.15"), stock: null },
      { id: "item_b", price: new Prisma.Decimal("29.99"), stock: null },
    ] as never);
    mockedOrderItems.createManyWithTx.mockResolvedValue([
      orderLine("a", "8.15", 3),
      orderLine("b", "29.99", 7),
    ] as never);

    const result = await orderService.placeOrder("cust_1", input);

    // Compared as decimal STRINGS, not numbers. Summing the two broken
    // subtotals as Decimals and calling `.toNumber()` lands back on the same
    // double as 234.38 — the drift is smaller than the float spacing there, so
    // a numeric comparison would pass while the API still served
    // 24.450000000000003 to the customer. The string is what JSON carries.
    expect(result.items.map((i) => String(i.subtotal))).toEqual([
      "24.45",
      "209.93",
    ]);

    // And the lines must explain the total exactly.
    const summed = result.items.reduce(
      (sum, i) => sum.plus(new Prisma.Decimal(String(i.subtotal))),
      new Prisma.Decimal(0),
    );
    expect(summed.toString()).toBe(String(result.totalPrice));
  });
});

describe("price-change detection", () => {
  const cartAt = (price: string) => {
    mockedCart.lockByOwnerWithItems.mockResolvedValue(
      cartWith([cartLine("a", price, 1)]) as never,
    );
  };
  const menuAt = (price: string) => {
    mockedMenuItems.findManyByIds.mockResolvedValue([
      { id: "item_a", price: new Prisma.Decimal(price), stock: null },
    ] as never);
  };

  it("treats differing decimal representations of the same amount as equal", async () => {
    // "30.00" and "30" are the same money. A string or float comparison would
    // reject this order for a price change that never happened.
    cartAt("30.00");
    menuAt("30");

    await expect(
      orderService.placeOrder("cust_1", input),
    ).resolves.toBeDefined();
  });

  it("rejects an order when the menu price moved by one piastre", async () => {
    cartAt("30.00");
    menuAt("30.01");

    await expect(
      orderService.placeOrder("cust_1", input),
    ).rejects.toMatchObject({
      message: orderErrors.PRICE_CHANGED.message,
      statusCode: orderErrors.PRICE_CHANGED.statusCode,
    });
    expect(mockedOrders.createOrder).not.toHaveBeenCalled();
  });

  it("rejects on a difference too small for a float comparison to see reliably", async () => {
    cartAt("0.1");
    menuAt("0.10000000000000001");

    await expect(
      orderService.placeOrder("cust_1", input),
    ).rejects.toMatchObject({
      statusCode: orderErrors.PRICE_CHANGED.statusCode,
    });
  });
});
