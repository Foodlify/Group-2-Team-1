/**
 * Overselling — integration.
 *
 * This is the test the whole stock design exists for, and the one a unit test
 * can only pretend to run: two checkouts genuinely racing in separate database
 * transactions for the last unit on the shelf.
 *
 * A read-then-write check ("is there stock? yes → decrement") passes every unit
 * test and still oversells here, because both readers see the same stock before
 * either writes. What makes it safe is the single conditional UPDATE
 * (`WHERE id = ? AND stock >= ?`), whose row lock forces the second transaction
 * to wait and then match zero rows. Only Postgres can demonstrate that.
 */
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

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnect();
});

/** `count` customers, each with a cart holding `quantity` of the same item. */
const setUpRivals = async (count: number, stock: number, quantity = 1) => {
  const { restaurant, menuItem } = await createCatalog({ stock });
  const buyers = [];
  for (let i = 0; i < count; i++) {
    const { customer, address } = await createCustomer(String(i + 1));
    await createCartWithItem(customer.id, restaurant.id, menuItem, quantity);
    buyers.push({ customerId: customer.id, addressId: address.id });
  }
  return { menuItem, buyers };
};

const checkoutAll = (buyers: { customerId: string; addressId: string }[]) =>
  Promise.allSettled(
    buyers.map((b) =>
      orderService.placeOrder(b.customerId, {
        addressId: b.addressId,
        paymentMethod: "CASH",
      }),
    ),
  );

describe("concurrent checkout for the last unit", () => {
  it("lets exactly one of two racing customers win", async () => {
    const { menuItem, buyers } = await setUpRivals(2, 1);

    const results = await checkoutAll(buyers);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      statusCode: orderErrors.OUT_OF_STOCK.statusCode,
    });

    const item = await prisma.menuItem.findUnique({
      where: { id: menuItem.id },
    });
    expect(item!.stock).toBe(0);
    expect(await prisma.order.count()).toBe(1);
  });

  it("never lets stock go negative with five customers chasing three units", async () => {
    const { menuItem, buyers } = await setUpRivals(5, 3);

    const results = await checkoutAll(buyers);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    const item = await prisma.menuItem.findUnique({
      where: { id: menuItem.id },
    });
    expect(item!.stock).toBe(0);
    expect(await prisma.order.count()).toBe(3);
  });

  it("counts units, not orders — a buyer taking two can shut out two singles", async () => {
    // 3 units, buyers wanting 2 each: exactly one succeeds and 1 unit is left.
    const { menuItem, buyers } = await setUpRivals(3, 3, 2);

    const results = await checkoutAll(buyers);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const item = await prisma.menuItem.findUnique({
      where: { id: menuItem.id },
    });
    expect(item!.stock).toBe(1);
  });

  it("leaves no half-written order behind for the losers", async () => {
    const { buyers } = await setUpRivals(3, 1);

    await checkoutAll(buyers);

    // One order, one set of items, one payment — the two failures rolled back
    // completely, and their carts survived for a retry.
    expect(await prisma.order.count()).toBe(1);
    expect(await prisma.transaction.count()).toBe(1);
    const orders = await prisma.order.findMany({
      include: { orderItems: true },
    });
    expect(orders[0]!.orderItems).toHaveLength(1);
    expect(await prisma.cart.count()).toBe(2);
  });

  it("does not serialise untracked items — everyone gets one", async () => {
    // stock null means the restaurant doesn't track it: no reservation, no
    // contention, and no accidental 409 for the slower customers.
    const { restaurant, menuItem } = await createCatalog({ stock: null });
    const buyers = [];
    for (let i = 0; i < 3; i++) {
      const { customer, address } = await createCustomer(String(i + 1));
      await createCartWithItem(customer.id, restaurant.id, menuItem, 1);
      buyers.push({ customerId: customer.id, addressId: address.id });
    }

    const results = await checkoutAll(buyers);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    const item = await prisma.menuItem.findUnique({
      where: { id: menuItem.id },
    });
    expect(item!.stock).toBeNull();
  });
});
