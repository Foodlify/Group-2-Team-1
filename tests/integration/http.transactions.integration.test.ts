/**
 * `View Payment Transactions` and `Generate Transaction Receipt`, over HTTP.
 *
 * Both are named endpoints in the official scope map, and both read money, so
 * the interesting cases are the boundaries: one customer must never see
 * another's ledger, and a receipt must never exist for money that did not
 * move.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Prisma } from "../../src/generated/prisma/client";
import prisma from "../../src/config/prisma";
import { createCatalog, disconnect, resetDatabase } from "./helpers/db";
import { api, asCookie, createAccount } from "./helpers/http";

/** A customer with an order, its items, and a settled payment. */
const seedPaidOrder = async (
  suffix: string,
  options: { amount?: string; status?: "SUCCESS" | "PENDING" } = {},
) => {
  const { user, customer, token } = await createAccount("CUSTOMER", { suffix });
  const { restaurant, menuItem } = await createCatalog();
  const address = await prisma.address.create({
    data: {
      customerId: customer!.id,
      addressLine1: `${suffix} Test Street`,
      city: "Cairo",
      postalCode: "11511",
      country: "EG",
      isDefault: true,
    },
  });
  const amount = new Prisma.Decimal(options.amount ?? "24.45");
  const order = await prisma.order.create({
    data: {
      customerId: customer!.id,
      addressId: address.id,
      restaurantId: restaurant.id,
      status: "DELIVERED",
      totalAmount: amount,
      timeline: [],
    },
  });
  await prisma.orderItems.create({
    data: {
      orderId: order.id,
      menuItemId: menuItem.id,
      quantity: 3,
      price: new Prisma.Decimal("8.15"),
      name: "Koshary",
    },
  });
  const transaction = await prisma.transaction.create({
    data: {
      type: "ORDER_PAYMENT",
      amount,
      currency: "EGP",
      status: options.status ?? "SUCCESS",
      paymentMethod: "CASH",
      internalTxNumber: `TXN-${suffix}`,
      orderId: order.id,
    },
  });
  return { user, customer: customer!, order, transaction, token };
};

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnect();
});

// ═══════════════════════════════════════════════════════════
describe("a customer listing their transactions", () => {
  it("returns their own, with pagination meta", async () => {
    const mine = await seedPaidOrder("owner");

    const res = await api()
      .get("/api/v1/customers/me/transactions")
      .set("Cookie", asCookie(mine.token));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].internalTxNumber).toBe("TXN-owner");
    expect(res.body.meta).toMatchObject({ page: 1, limit: 20, total: 1 });
  });

  it("never returns another customer's transactions", async () => {
    const mine = await seedPaidOrder("owner");
    await seedPaidOrder("stranger");

    const res = await api()
      .get("/api/v1/customers/me/transactions")
      .set("Cookie", asCookie(mine.token));

    // Two transactions exist in the database; exactly one belongs to caller.
    expect(await prisma.transaction.count()).toBe(2);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].internalTxNumber).toBe("TXN-owner");
  });

  it("applies the type filter without losing the owner scope", async () => {
    const mine = await seedPaidOrder("owner");
    await seedPaidOrder("stranger");

    const res = await api()
      .get("/api/v1/customers/me/transactions?type=ORDER_PAYMENT")
      .set("Cookie", asCookie(mine.token));

    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.total).toBe(1);
  });

  it("401s an anonymous caller", async () => {
    const res = await api().get("/api/v1/customers/me/transactions");
    expect(res.status).toBe(401);
  });

  it("400s an invalid filter", async () => {
    const mine = await seedPaidOrder("owner");

    const res = await api()
      .get("/api/v1/customers/me/transactions?status=NOT_A_STATUS")
      .set("Cookie", asCookie(mine.token));

    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════
describe("the admin listing", () => {
  it("returns every customer's transactions", async () => {
    await seedPaidOrder("a");
    await seedPaidOrder("b");
    const { token: adminToken } = await createAccount("ADMIN");

    const res = await api()
      .get("/api/v1/transactions")
      .set("Cookie", asCookie(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it("403s a customer", async () => {
    const mine = await seedPaidOrder("owner");

    const res = await api()
      .get("/api/v1/transactions")
      .set("Cookie", asCookie(mine.token));

    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════
describe("the receipt", () => {
  it("itemises what was actually paid", async () => {
    const mine = await seedPaidOrder("owner");

    const res = await api()
      .get(`/api/v1/customers/me/transactions/${mine.transaction.id}/receipt`)
      .set("Cookie", asCookie(mine.token));

    expect(res.status).toBe(200);
    expect(res.body.data.receiptNumber).toBe("TXN-owner");
    // 8.15 x 3, through a real Decimal column and back.
    expect(res.body.data.items[0].lineTotal).toBe(24.45);
    expect(res.body.data.order.itemsTotal).toBe(24.45);
    expect(res.body.data.order.orderTotal).toBe(24.45);
  });

  it("keeps the name and price recorded at order time", async () => {
    const mine = await seedPaidOrder("owner");

    // The restaurant renames and reprices the dish after the fact.
    await prisma.menuItem.updateMany({
      data: { name: "Koshary Deluxe", price: new Prisma.Decimal("99.00") },
    });

    const res = await api()
      .get(`/api/v1/customers/me/transactions/${mine.transaction.id}/receipt`)
      .set("Cookie", asCookie(mine.token));

    // A receipt that follows the catalog would restate a document the
    // customer already has.
    expect(res.body.data.items[0].name).toBe("Koshary");
    expect(res.body.data.items[0].unitPrice).toBe(8.15);
  });

  it("404s a receipt belonging to another customer", async () => {
    const stranger = await seedPaidOrder("stranger");
    const mine = await seedPaidOrder("owner");

    const res = await api()
      .get(
        `/api/v1/customers/me/transactions/${stranger.transaction.id}/receipt`,
      )
      .set("Cookie", asCookie(mine.token));

    // 404 rather than 403: a 403 would confirm the id is real.
    expect(res.status).toBe(404);
  });

  it("409s a transaction that has not settled", async () => {
    const pending = await seedPaidOrder("pending", { status: "PENDING" });

    const res = await api()
      .get(
        `/api/v1/customers/me/transactions/${pending.transaction.id}/receipt`,
      )
      .set("Cookie", asCookie(pending.token));

    // A receipt is proof money moved; issuing one here would be a lie the
    // customer could wave at support.
    expect(res.status).toBe(409);
  });

  it("lets an admin read any receipt", async () => {
    const mine = await seedPaidOrder("owner");
    const { token: adminToken } = await createAccount("ADMIN");

    const res = await api()
      .get(`/api/v1/transactions/${mine.transaction.id}/receipt`)
      .set("Cookie", asCookie(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.data.customer.email).toBe("http-owner@example.com");
  });

  it("404s an unknown id", async () => {
    const { token: adminToken } = await createAccount("ADMIN");

    const res = await api()
      .get("/api/v1/transactions/clzzzzzzzzzzzzzzzzzzzzzzz/receipt")
      .set("Cookie", asCookie(adminToken));

    expect(res.status).toBe(404);
  });
});
