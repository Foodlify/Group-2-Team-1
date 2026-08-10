import { afterAll, beforeEach, describe, expect, it } from "vitest";
import prisma from "../../src/config/prisma";
import { orderService } from "../../src/modules/order/order.service";
import { orderErrors } from "../../src/shared/exceptions/order.errors";
import {
  createCartWithItem,
  createCatalog,
  createCustomer,
  disconnect,
  resetDatabase,
} from "./helpers/db";

const ADMIN = { userId: "user_admin", role: "ADMIN" };

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnect();
});

describe("placeOrder against a real database", () => {
  it("commits the order, its items, the payment and the cleared cart together", async () => {
    const { customer, address } = await createCustomer();
    const { restaurant, menuItem } = await createCatalog({ price: "30.00" });
    await createCartWithItem(customer.id, restaurant.id, menuItem, 2);

    const result = await orderService.placeOrder(customer.id, {
      addressId: address.id,
      paymentMethod: "CASH",
    });

    const [order, items, transactions, carts] = await Promise.all([
      prisma.order.findUnique({ where: { id: result.id } }),
      prisma.orderItems.findMany({ where: { orderId: result.id } }),
      prisma.transaction.findMany({ where: { orderId: result.id } }),
      prisma.cart.findMany({ where: { customerId: customer.id } }),
    ]);

    expect(order?.status).toBe("PENDING");
    expect(order?.totalAmount.toString()).toBe("60");
    expect(items).toHaveLength(1);
    expect(items[0]!.quantity).toBe(2);
    expect(transactions).toHaveLength(1);
    expect(transactions[0]!.status).toBe("PENDING");
    expect(transactions[0]!.type).toBe("ORDER_PAYMENT");

    expect(carts).toHaveLength(0);
    expect(await prisma.cartItem.count()).toBe(0);
  });

  it("keeps money exact through the Decimal column", async () => {
    const { customer, address } = await createCustomer();
    const { restaurant, menuItem } = await createCatalog({ price: "8.15" });
    await createCartWithItem(customer.id, restaurant.id, menuItem, 3);

    const result = await orderService.placeOrder(customer.id, {
      addressId: address.id,
      paymentMethod: "CASH",
    });

    const order = await prisma.order.findUnique({ where: { id: result.id } });

    expect(order!.totalAmount.toString()).toBe("24.45");
    expect(result.totalPrice).toBe(24.45);
    expect(result.items[0]!.subtotal).toBe(24.45);
  });

  it("writes the timeline as real jsonb the app can read back", async () => {
    const { customer, address } = await createCustomer();
    const { restaurant, menuItem } = await createCatalog();
    await createCartWithItem(customer.id, restaurant.id, menuItem);

    const result = await orderService.placeOrder(customer.id, {
      addressId: address.id,
      paymentMethod: "CASH",
    });

    const order = await prisma.order.findUnique({ where: { id: result.id } });
    const timeline = order!.timeline as Array<{ status: string }>;
    expect(timeline).toHaveLength(1);
    expect(timeline[0]!.status).toBe("PENDING");
  });

  it("decrements tracked stock by exactly the ordered quantity", async () => {
    const { customer, address } = await createCustomer();
    const { restaurant, menuItem } = await createCatalog({ stock: 10 });
    await createCartWithItem(customer.id, restaurant.id, menuItem, 4);

    await orderService.placeOrder(customer.id, {
      addressId: address.id,
      paymentMethod: "CASH",
    });

    const after = await prisma.menuItem.findUnique({
      where: { id: menuItem.id },
    });
    expect(after!.stock).toBe(6);
  });

  it("rolls the whole checkout back when stock runs out", async () => {
    const { customer, address } = await createCustomer();
    const { restaurant, menuItem } = await createCatalog({ stock: 1 });
    await createCartWithItem(customer.id, restaurant.id, menuItem, 5);

    await expect(
      orderService.placeOrder(customer.id, {
        addressId: address.id,
        paymentMethod: "CASH",
      }),
    ).rejects.toMatchObject({
      statusCode: orderErrors.OUT_OF_STOCK.statusCode,
    });

    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.orderItems.count()).toBe(0);
    expect(await prisma.transaction.count()).toBe(0);
    expect(await prisma.cart.count()).toBe(1);
    const item = await prisma.menuItem.findUnique({
      where: { id: menuItem.id },
    });
    expect(item!.stock).toBe(1);
  });

  it("rejects a checkout whose menu price moved, leaving no trace", async () => {
    const { customer, address } = await createCustomer();
    const { restaurant, menuItem } = await createCatalog({ price: "30.00" });
    await createCartWithItem(customer.id, restaurant.id, menuItem, 1);

    await prisma.menuItem.update({
      where: { id: menuItem.id },
      data: { price: "35.00" },
    });

    await expect(
      orderService.placeOrder(customer.id, {
        addressId: address.id,
        paymentMethod: "CASH",
      }),
    ).rejects.toMatchObject({
      statusCode: orderErrors.PRICE_CHANGED.statusCode,
    });
    expect(await prisma.order.count()).toBe(0);
  });

  it("refuses to sell an item that was soft-deleted after it entered the cart", async () => {
    const { customer, address } = await createCustomer();
    const { restaurant, menuItem } = await createCatalog({ stock: 5 });
    await createCartWithItem(customer.id, restaurant.id, menuItem, 1);
    await prisma.menuItem.update({
      where: { id: menuItem.id },
      data: { isDeleted: true },
    });

    await expect(
      orderService.placeOrder(customer.id, {
        addressId: address.id,
        paymentMethod: "CASH",
      }),
    ).rejects.toMatchObject({
      statusCode: orderErrors.MENU_ITEM_UNAVAILABLE.statusCode,
    });
    const item = await prisma.menuItem.findUnique({
      where: { id: menuItem.id },
    });
    expect(item!.stock).toBe(5);
  });
});

describe("order lifecycle against a real database", () => {
  const place = async () => {
    const { customer, address } = await createCustomer();
    const { restaurant, menuItem } = await createCatalog({ stock: 10 });
    await createCartWithItem(customer.id, restaurant.id, menuItem, 2);
    const order = await orderService.placeOrder(customer.id, {
      addressId: address.id,
      paymentMethod: "CASH",
    });
    return { customer, menuItem, order };
  };

  it("appends to the jsonb timeline with the raw UPDATE, preserving history", async () => {
    const { order } = await place();

    await orderService.updateOrderStatus(
      order.id,
      { status: "CONFIRMED" },
      ADMIN,
    );
    const after = await orderService.updateOrderStatus(
      order.id,
      {
        status: "PREPARING",
      },
      ADMIN,
    );

    expect(after.timeline.map((e) => e.status)).toEqual([
      "PENDING",
      "CONFIRMED",
      "PREPARING",
    ]);
    const row = await prisma.order.findUnique({ where: { id: order.id } });
    expect(row!.status).toBe("PREPARING");
  });

  it("enforces the status precondition in SQL, not just in the service", async () => {
    const { order } = await place();
    await orderService.updateOrderStatus(
      order.id,
      { status: "CONFIRMED" },
      ADMIN,
    );

    await expect(
      orderService.cancelOrder(order.customerId, order.id),
    ).rejects.toMatchObject({
      statusCode: orderErrors.ORDER_NOT_CANCELLABLE.statusCode,
    });
  });

  it("settles the cash transaction on delivery", async () => {
    const { order } = await place();

    for (const status of [
      "CONFIRMED",
      "PREPARING",
      "OUT_FOR_DELIVERY",
    ] as const) {
      await orderService.updateOrderStatus(order.id, { status }, ADMIN);
    }
    await orderService.updateOrderStatus(
      order.id,
      { status: "DELIVERED" },
      ADMIN,
    );

    const transactions = await prisma.transaction.findMany({
      where: { orderId: order.id },
    });
    expect(transactions).toHaveLength(1);
    expect(transactions[0]!.status).toBe("SUCCESS");
  });

  it("returns stock and reconciles the payment when cancelled", async () => {
    const { menuItem, order, customer } = await place();

    await orderService.cancelOrder(customer.id, order.id);

    const [item, transactions] = await Promise.all([
      prisma.menuItem.findUnique({ where: { id: menuItem.id } }),
      prisma.transaction.findMany({ where: { orderId: order.id } }),
    ]);
    expect(item!.stock).toBe(10);

    expect(transactions).toHaveLength(1);
    expect(transactions[0]!.status).toBe("FAILED");
  });

  it("issues a matching REFUND when a settled order is cancelled", async () => {
    const { order, customer } = await place();

    await prisma.transaction.updateMany({
      where: { orderId: order.id },
      data: { status: "SUCCESS" },
    });

    await orderService.cancelOrder(customer.id, order.id);

    const transactions = await prisma.transaction.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: "asc" },
    });
    expect(transactions).toHaveLength(2);
    const refund = transactions.find((t) => t.type === "REFUND");
    expect(refund).toBeDefined();
    expect(refund!.status).toBe("SUCCESS");
    expect(refund!.amount.toString()).toBe("60");
  });
});
