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

    expect(await prisma.transactionDetails.count()).toBe(0);
  });

  it("gives one none when the metadata carries nothing we understand", async () => {
    await cardPayment({ note: "collected on delivery" });

    expect(await prisma.transactionDetails.count()).toBe(0);
  });
});

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

    expect((await detailsOf(refund.id)).failureReason).toBe(
      "card network unavailable",
    );
  });
});

describe("who pays for the join", () => {
  it("leaves the details out unless they are asked for", async () => {
    await cardPayment({ gateway: "stripe", paymentIntentId: "pi_1" });

    const { rows } = await transactionRepository.findPage({}, 0, 20, false);

    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty("details");
  });

  it("includes them when they are", async () => {
    await cardPayment({ gateway: "stripe", paymentIntentId: "pi_1" });

    const { rows } = await transactionRepository.findPage({}, 0, 20, true);

    expect(rows[0]).toHaveProperty("details");
  });
});

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

    expect(await prisma.transactionDetails.count()).toBe(0);
  });
});

describe("the refund reference the column exists for", () => {
  it("prefers the column when the column and the blob disagree", async () => {
    const created = await cardPayment({
      gateway: "stripe",
      stage: "paid",
      paymentIntentId: "pi_from_column",
    });

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

    expect(row!.details?.paymentIntentId).toBe("pi_1");
    expect(await StripeCardStrategy.resolvePaymentIntentId(row!)).toBe("pi_1");
  });

  it("falls back to the blob for a payment settled before this table existed", async () => {
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
