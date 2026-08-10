/**
 * `Transaction Details`, against a real database.
 *
 * The table is filled by successive writes about the same payment — the
 * checkout knows the session id, the webhook later knows the PaymentIntent —
 * so the property that matters is that each write ADDS to the row instead of
 * replacing it. A test that only ever writes once cannot tell the difference.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import prisma from "../../src/config/prisma";
import { Prisma } from "../../src/generated/prisma/client";
import { transactionRepository } from "../../src/modules/transaction/transaction.repository";
import { StripeCardStrategy } from "../../src/modules/payment/stripe.strategy";
import {
  createCatalog,
  createCustomer,
  disconnect,
  resetDatabase,
} from "./helpers/db";

const cardPayment = (metadata?: Prisma.InputJsonValue) =>
  transactionRepository.createTransaction({
    type: "ORDER_PAYMENT",
    amount: 24.45,
    status: "PENDING",
    paymentMethod: "CREDIT_CARD",
    ...(metadata ? { metadata } : {}),
  });

const detailsOf = (transactionId: string) =>
  prisma.transactionDetails.findUniqueOrThrow({ where: { transactionId } });

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnect();
});

// ═══════════════════════════════════════════════════════════
describe("what gets a details row", () => {
  it("records the gateway facts of a card payment", async () => {
    const payment = await cardPayment({
      gateway: "stripe",
      stage: "awaiting_checkout",
    });

    expect(await detailsOf(payment.id)).toMatchObject({
      gateway: "stripe",
      stage: "awaiting_checkout",
    });
  });

  it("gives a cash payment none", async () => {
    await transactionRepository.createTransaction({
      type: "ORDER_PAYMENT",
      amount: 10,
      status: "PENDING",
      paymentMethod: "CASH",
    });

    // No gateway was involved. An all-null row would say one was.
    expect(await prisma.transactionDetails.count()).toBe(0);
  });

  it("gives one none when the metadata carries nothing we understand", async () => {
    await cardPayment({ note: "collected on delivery" });

    expect(await prisma.transactionDetails.count()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
describe("successive writes about the same payment", () => {
  it("adds the PaymentIntent without losing the session id", async () => {
    const payment = await cardPayment({
      gateway: "stripe",
      stage: "checkout_created",
      sessionId: "cs_1",
    });

    await transactionRepository.recordGatewayOutcome(payment.id, "SUCCESS", {
      metadata: { gateway: "stripe", stage: "paid", paymentIntentId: "pi_1" },
    });

    // This is the whole reason the write merges. Replacing would drop `cs_1`,
    // and reconciling against Stripe's records needs both.
    expect(await detailsOf(payment.id)).toMatchObject({
      sessionId: "cs_1",
      paymentIntentId: "pi_1",
      stage: "paid",
    });
  });

  it("keeps exactly one row however many writes land", async () => {
    const payment = await cardPayment({ gateway: "stripe", stage: "a" });

    for (const stage of ["b", "c", "d"]) {
      await transactionRepository.attachGatewayReference(payment.id, {
        metadata: { gateway: "stripe", stage },
      });
    }

    expect(await prisma.transactionDetails.count()).toBe(1);
    expect((await detailsOf(payment.id)).stage).toBe("d");
  });

  it("records a failure reason on a refund that did not go through", async () => {
    const refund = await transactionRepository.createTransaction({
      type: "REFUND",
      amount: 24.45,
      status: "PENDING",
      paymentMethod: "CREDIT_CARD",
    });

    await transactionRepository.recordGatewayOutcome(refund.id, "FAILED", {
      metadata: { error: "card network unavailable" },
    });

    // A FAILED refund is money still owed; why it failed is the first thing
    // whoever chases it needs.
    expect((await detailsOf(refund.id)).failureReason).toBe(
      "card network unavailable",
    );
  });
});

// ═══════════════════════════════════════════════════════════
describe("who pays for the join", () => {
  it("leaves the details out unless they are asked for", async () => {
    await cardPayment({ gateway: "stripe", paymentIntentId: "pi_1" });

    const { rows } = await transactionRepository.findPage({}, 0, 20, false);

    // Asserted on the repository, not on the response: the customer mapper
    // drops `details` either way, so a listing that quietly loaded them would
    // look identical from outside while paying for a join on every page.
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty("details");
  });

  it("includes them when they are", async () => {
    await cardPayment({ gateway: "stripe", paymentIntentId: "pi_1" });

    const { rows } = await transactionRepository.findPage({}, 0, 20, true);

    expect(rows[0]).toHaveProperty("details");
  });
});

// ═══════════════════════════════════════════════════════════
describe("the details and the transaction commit together", () => {
  it("leaves neither behind when the caller's transaction rolls back", async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await transactionRepository.createTransaction(
          {
            type: "ORDER_PAYMENT",
            amount: 10,
            status: "PENDING",
            paymentMethod: "CREDIT_CARD",
            metadata: { gateway: "stripe", stage: "checkout_created" },
          },
          tx,
        );
        throw new Error("checkout failed after the payment row was written");
      }),
    ).rejects.toThrow();

    expect(await prisma.transaction.count()).toBe(0);
    expect(await prisma.transactionDetails.count()).toBe(0);
  });

  it("is removed by the database when the transaction row really goes", async () => {
    const payment = await cardPayment({ gateway: "stripe", stage: "paid" });

    await prisma.transaction.delete({ where: { id: payment.id } });

    // Unlike the audit trail, these details describe nothing without their
    // transaction — so here a cascade is right.
    expect(await prisma.transactionDetails.count()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
describe("the refund reference the column exists for", () => {
  it("prefers the column when the column and the blob disagree", async () => {
    const created = await cardPayment({
      gateway: "stripe",
      stage: "paid",
      paymentIntentId: "pi_from_column",
    });
    // Made to disagree deliberately. Agreeing sources cannot show which one
    // was actually read.
    await prisma.transaction.update({
      where: { id: created.id },
      data: { metadata: { paymentIntentId: "pi_from_blob" } },
    });

    const loaded = await prisma.transaction.findUniqueOrThrow({
      where: { id: created.id },
      include: { details: true },
    });

    expect(await StripeCardStrategy.resolvePaymentIntentId(loaded)).toBe(
      "pi_from_column",
    );
  });

  it("comes joined onto the rows a refund is planned from", async () => {
    const { customer, address } = await createCustomer("det");
    const { restaurant } = await createCatalog();
    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        addressId: address.id,
        restaurantId: restaurant.id,
        status: "CONFIRMED",
        totalAmount: new Prisma.Decimal("24.45"),
        timeline: [],
      },
    });
    await transactionRepository.createTransaction({
      type: "ORDER_PAYMENT",
      amount: 24.45,
      status: "SUCCESS",
      paymentMethod: "CREDIT_CARD",
      orderId: order.id,
      metadata: { gateway: "stripe", paymentIntentId: "pi_1" },
    });

    const [row] = await transactionRepository.findByOrderId(order.id);

    // Joined here so the strategy needs no query of its own. A payment
    // strategy that reaches for the database cannot be unit tested without
    // one — which is exactly how this went wrong the first time.
    expect(row!.details?.paymentIntentId).toBe("pi_1");
    expect(await StripeCardStrategy.resolvePaymentIntentId(row!)).toBe("pi_1");
  });

  it("falls back to the blob for a payment settled before this table existed", async () => {
    // Its details row was never written, but the fact is still in the blob and
    // is still correct. Dropping the fallback would make every old order
    // unrefundable without a round trip to Stripe.
    const legacy = await prisma.transaction.create({
      data: {
        type: "ORDER_PAYMENT",
        amount: 24.45,
        status: "SUCCESS",
        paymentMethod: "CREDIT_CARD",
        internalTxNumber: "TXN-legacy",
        metadata: { paymentIntentId: "pi_from_blob" },
      },
      include: { details: true },
    });

    expect(legacy.details).toBeNull();
    expect(await StripeCardStrategy.resolvePaymentIntentId(legacy)).toBe(
      "pi_from_blob",
    );
  });
});
