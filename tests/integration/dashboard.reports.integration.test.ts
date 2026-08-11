import { afterAll, beforeEach, describe, expect, it } from "vitest";
import prisma from "../../src/config/prisma";
import { Prisma } from "../../src/generated/prisma/client";
import { dashboardService } from "../../src/modules/dashboard/dashboard.service";
import { dashboardRepository } from "../../src/modules/dashboard/dashboard.repository";
import { createCustomer, disconnect, resetDatabase } from "./helpers/db";

const dec = (v: string) => new Prisma.Decimal(v);

async function createRestaurant(name: string) {
  const restaurant = await prisma.restaurant.create({ data: { name } });
  const menu = await prisma.menu.create({
    data: { name: `${name} menu`, restaurantId: restaurant.id },
  });
  const menuItem = await prisma.menuItem.create({
    data: { menuId: menu.id, name: "Dish", price: dec("30.00") },
  });
  return { restaurant, menu, menuItem };
}

async function createOrder(opts: {
  customerId: string;
  addressId: string;
  restaurantId: string;
  total: string;
  status?: string;
  orderDate?: Date;
}) {
  return prisma.order.create({
    data: {
      customerId: opts.customerId,
      addressId: opts.addressId,
      restaurantId: opts.restaurantId,
      totalAmount: dec(opts.total),
      status: (opts.status ?? "DELIVERED") as never,
      ...(opts.orderDate ? { orderDate: opts.orderDate } : {}),
    },
  });
}

let counter = 0;
async function createTransaction(opts: {
  orderId: string;
  type: string;
  amount: string;
  status?: string;
  createdAt?: Date;
}) {
  counter += 1;
  return prisma.transaction.create({
    data: {
      type: opts.type as never,
      amount: dec(opts.amount),
      currency: "EGP",
      status: (opts.status ?? "SUCCESS") as never,
      paymentMethod: "CREDIT_CARD",
      internalTxNumber: `TX-${counter}-${opts.orderId}`,
      orderId: opts.orderId,
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
    },
  });
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnect();
});

describe("the raw date_trunc query", () => {
  it("runs, and buckets transactions by day", async () => {
    const { customer, address } = await createCustomer("1");
    const { restaurant } = await createRestaurant("Kitchen");
    const order = await createOrder({
      customerId: customer.id,
      addressId: address.id,
      restaurantId: restaurant.id,
      total: "100.00",
    });

    await createTransaction({
      orderId: order.id,
      type: "ORDER_PAYMENT",
      amount: "40.00",
      createdAt: new Date("2026-08-01T09:00:00.000Z"),
    });
    await createTransaction({
      orderId: order.id,
      type: "ORDER_PAYMENT",
      amount: "60.00",
      createdAt: new Date("2026-08-01T21:30:00.000Z"),
    });
    await createTransaction({
      orderId: order.id,
      type: "ORDER_PAYMENT",
      amount: "25.00",
      createdAt: new Date("2026-08-02T10:00:00.000Z"),
    });

    const report = await dashboardService.getTransactionReport({
      granularity: "day",
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-08-03T00:00:00.000Z",
    });

    expect(report.series).toHaveLength(2);
    expect(report.series[0]!.period).toBe("2026-08-01T00:00:00.000Z");
    expect(report.series[0]!.payments).toBe(100);
    expect(report.series[1]!.period).toBe("2026-08-02T00:00:00.000Z");
    expect(report.series[1]!.payments).toBe(25);
  });

  it("collapses a whole month into one bucket when asked", async () => {
    const { customer, address } = await createCustomer("1");
    const { restaurant } = await createRestaurant("Kitchen");
    const order = await createOrder({
      customerId: customer.id,
      addressId: address.id,
      restaurantId: restaurant.id,
      total: "100.00",
    });
    for (const day of ["01", "15", "28"]) {
      await createTransaction({
        orderId: order.id,
        type: "ORDER_PAYMENT",
        amount: "10.00",
        createdAt: new Date(`2026-08-${day}T12:00:00.000Z`),
      });
    }

    const report = await dashboardService.getTransactionReport({
      granularity: "month",
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-09-01T00:00:00.000Z",
    });

    expect(report.series).toHaveLength(1);
    expect(report.series[0]!.period).toBe("2026-08-01T00:00:00.000Z");
    expect(report.series[0]!.payments).toBe(30);
  });

  it("excludes the upper bound, so adjacent windows never double-count", async () => {
    const { customer, address } = await createCustomer("1");
    const { restaurant } = await createRestaurant("Kitchen");
    const order = await createOrder({
      customerId: customer.id,
      addressId: address.id,
      restaurantId: restaurant.id,
      total: "100.00",
    });

    await createTransaction({
      orderId: order.id,
      type: "ORDER_PAYMENT",
      amount: "10.00",
      createdAt: new Date("2026-08-02T00:00:00.000Z"),
    });

    const first = await dashboardService.getTransactionReport({
      granularity: "day",
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-08-02T00:00:00.000Z",
    });
    const second = await dashboardService.getTransactionReport({
      granularity: "day",
      from: "2026-08-02T00:00:00.000Z",
      to: "2026-08-03T00:00:00.000Z",
    });

    expect(first.totals.payments).toBe(0);
    expect(second.totals.payments).toBe(10);
  });

  it("ignores transactions that never succeeded", async () => {
    const { customer, address } = await createCustomer("1");
    const { restaurant } = await createRestaurant("Kitchen");
    const order = await createOrder({
      customerId: customer.id,
      addressId: address.id,
      restaurantId: restaurant.id,
      total: "100.00",
    });
    await createTransaction({
      orderId: order.id,
      type: "ORDER_PAYMENT",
      amount: "70.00",
      createdAt: new Date("2026-08-01T10:00:00.000Z"),
    });
    for (const status of ["PENDING", "FAILED"]) {
      await createTransaction({
        orderId: order.id,
        type: "ORDER_PAYMENT",
        amount: "999.00",
        status,
        createdAt: new Date("2026-08-01T11:00:00.000Z"),
      });
    }

    const report = await dashboardService.getTransactionReport({
      granularity: "day",
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-08-02T00:00:00.000Z",
    });

    expect(report.totals.payments).toBe(70);
    expect(report.transactions).toBe(1);
  });
});

describe("money survives the round-trip through numeric", () => {
  it("sums amounts that float arithmetic would drift on", async () => {
    const { customer, address } = await createCustomer("1");
    const { restaurant } = await createRestaurant("Kitchen");
    const order = await createOrder({
      customerId: customer.id,
      addressId: address.id,
      restaurantId: restaurant.id,
      total: "100.00",
    });

    for (let i = 0; i < 11; i += 1) {
      await createTransaction({
        orderId: order.id,
        type: "ORDER_PAYMENT",
        amount: "0.07",
        createdAt: new Date("2026-08-01T10:00:00.000Z"),
      });
    }

    const report = await dashboardService.getTransactionReport({
      granularity: "day",
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-08-02T00:00:00.000Z",
    });

    expect(report.totals.payments).toBe(0.77);
  });

  it("nets a real refund off a real payment", async () => {
    const { customer, address } = await createCustomer("1");
    const { restaurant } = await createRestaurant("Kitchen");
    const order = await createOrder({
      customerId: customer.id,
      addressId: address.id,
      restaurantId: restaurant.id,
      total: "91.00",
    });
    await createTransaction({
      orderId: order.id,
      type: "ORDER_PAYMENT",
      amount: "91.00",
      createdAt: new Date("2026-08-01T10:00:00.000Z"),
    });
    await createTransaction({
      orderId: order.id,
      type: "REFUND",
      amount: "91.00",
      createdAt: new Date("2026-08-01T12:00:00.000Z"),
    });

    const report = await dashboardService.getTransactionReport({
      granularity: "day",
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-08-02T00:00:00.000Z",
    });

    expect(report.series[0]!.payments).toBe(91);
    expect(report.series[0]!.refunds).toBe(91);
    expect(report.series[0]!.net).toBe(0);
  });
});

describe("per-restaurant scoping goes through the order join", () => {
  it("reports only the restaurant's own money", async () => {
    const { customer, address } = await createCustomer("1");
    const a = await createRestaurant("Alpha");
    const b = await createRestaurant("Beta");

    const orderA = await createOrder({
      customerId: customer.id,
      addressId: address.id,
      restaurantId: a.restaurant.id,
      total: "100.00",
    });
    const orderB = await createOrder({
      customerId: customer.id,
      addressId: address.id,
      restaurantId: b.restaurant.id,
      total: "500.00",
    });
    await createTransaction({
      orderId: orderA.id,
      type: "ORDER_PAYMENT",
      amount: "100.00",
      createdAt: new Date("2026-08-01T10:00:00.000Z"),
    });
    await createTransaction({
      orderId: orderB.id,
      type: "ORDER_PAYMENT",
      amount: "500.00",
      createdAt: new Date("2026-08-01T10:00:00.000Z"),
    });

    const report = await dashboardService.getRestaurantReport(a.restaurant.id, {
      granularity: "day",
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-08-02T00:00:00.000Z",
    });

    expect(report.report.totals.payments).toBe(100);
    expect(report.revenueAllTime.payments).toBe(100);
    expect(report.counters.orders).toBe(1);
  });
});

describe("counters reflect what is actually visible", () => {
  it("leaves soft-deleted restaurants out", async () => {
    await createRestaurant("Visible");
    const gone = await createRestaurant("Deleted");
    await prisma.restaurant.update({
      where: { id: gone.restaurant.id },
      data: { isDeleted: true },
    });

    const overview = await dashboardService.getOverview();

    expect(overview.counters.restaurants).toBe(1);
  });

  it("refuses to report on a soft-deleted restaurant", async () => {
    const gone = await createRestaurant("Deleted");
    await prisma.restaurant.update({
      where: { id: gone.restaurant.id },
      data: { isDeleted: true },
    });

    await expect(
      dashboardService.getRestaurantReport(gone.restaurant.id, {
        granularity: "day",
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("separates active customers from disabled ones", async () => {
    const one = await createCustomer("1");
    await createCustomer("2");
    await prisma.user.update({
      where: { id: one.user.id },
      data: { isActive: false },
    });

    const overview = await dashboardService.getOverview();

    expect(overview.counters.customers).toBe(2);
    expect(overview.counters.activeCustomers).toBe(1);
  });

  it("breaks orders down by status", async () => {
    const { customer, address } = await createCustomer("1");
    const { restaurant } = await createRestaurant("Kitchen");
    for (const status of ["DELIVERED", "DELIVERED", "CANCELLED", "PENDING"]) {
      await createOrder({
        customerId: customer.id,
        addressId: address.id,
        restaurantId: restaurant.id,
        total: "10.00",
        status,
      });
    }

    const overview = await dashboardService.getOverview();

    expect(overview.counters.orders).toBe(4);
    expect(overview.counters.deliveredOrders).toBe(2);
    expect(overview.counters.cancelledOrders).toBe(1);
    expect(overview.ordersByStatus).toMatchObject({
      DELIVERED: 2,
      CANCELLED: 1,
      PENDING: 1,
    });
  });

  it("counts today's orders but not last month's", async () => {
    const { customer, address } = await createCustomer("1");
    const { restaurant } = await createRestaurant("Kitchen");
    await createOrder({
      customerId: customer.id,
      addressId: address.id,
      restaurantId: restaurant.id,
      total: "10.00",
    });
    await createOrder({
      customerId: customer.id,
      addressId: address.id,
      restaurantId: restaurant.id,
      total: "10.00",
      orderDate: new Date("2020-01-15T10:00:00.000Z"),
    });

    const overview = await dashboardService.getOverview();

    expect(overview.counters.orders).toBe(2);
    expect(overview.counters.ordersToday).toBe(1);
    expect(overview.counters.ordersThisMonth).toBe(1);
  });
});

describe("the repository's own queries", () => {
  it("returns an empty series rather than failing on no data", async () => {
    const rows = await dashboardRepository.transactionSeries(
      "day",
      new Date("2026-01-01T00:00:00.000Z"),
      new Date("2026-02-01T00:00:00.000Z"),
    );

    expect(rows).toEqual([]);
  });

  it("returns counts as numbers, not BigInt", async () => {
    const { customer, address } = await createCustomer("1");
    const { restaurant } = await createRestaurant("Kitchen");
    const order = await createOrder({
      customerId: customer.id,
      addressId: address.id,
      restaurantId: restaurant.id,
      total: "10.00",
    });
    await createTransaction({
      orderId: order.id,
      type: "ORDER_PAYMENT",
      amount: "10.00",
      createdAt: new Date("2026-08-01T10:00:00.000Z"),
    });

    const rows = await dashboardRepository.transactionSeries(
      "day",
      new Date("2026-08-01T00:00:00.000Z"),
      new Date("2026-08-02T00:00:00.000Z"),
    );

    expect(typeof rows[0]!.count).toBe("number");
    expect(rows[0]!.count).toBe(1);
  });
});
