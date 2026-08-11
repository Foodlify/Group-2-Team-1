import { beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";
import { Prisma } from "../../src/generated/prisma/client";

const { WEBHOOK_SECRET } = vi.hoisted(() => ({
  WEBHOOK_SECRET: "whsec_test_secret_for_unit_tests",
}));

vi.mock("../../src/config/env", async (importOriginal) => {
  const actual = await importOriginal<{ default: Record<string, unknown> }>();
  return {
    default: {
      ...actual.default,
      STRIPE_SECRET_KEY: "sk_test_unit",
      STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    },
  };
});

vi.mock("../../src/modules/order/order.repository", () => ({
  orderRepository: {
    transaction: vi.fn(),
    findById: vi.fn(),
    appendTimelineEntry: vi.fn(),
  },
}));

vi.mock("../../src/modules/order/order.service", () => ({
  orderService: { cancelOrder: vi.fn() },
}));

vi.mock("../../src/modules/transaction/transaction.service", () => ({
  transactionService: {
    findPendingGatewayPayment: vi.fn(),
    updateStatus: vi.fn(),
    recordGatewayOutcome: vi.fn(),
    attachGatewayReference: vi.fn(),
    findByExternalRef: vi.fn(),
  },
}));

vi.mock("../../src/modules/notification/notification.service", () => ({
  notificationService: { notifyOrderStatusChanged: vi.fn() },
}));

import { paymentWebhookService } from "../../src/modules/payment/payment.webhook.service";
import { orderRepository } from "../../src/modules/order/order.repository";
import { orderService } from "../../src/modules/order/order.service";
import { transactionService } from "../../src/modules/transaction/transaction.service";
import { notificationService } from "../../src/modules/notification/notification.service";
import { paymentErrors } from "../../src/shared/exceptions/payment.errors";

const mockedOrders = vi.mocked(orderRepository);
const mockedOrderService = vi.mocked(orderService);
const mockedTransactions = vi.mocked(transactionService);
const mockedNotifications = vi.mocked(notificationService);

const tx = { __brand: "tx" } as never;

const signedEvent = (
  type: string,
  session: Record<string, unknown>,
  secret = WEBHOOK_SECRET,
): { body: Buffer; signature: string } => {
  const payload = JSON.stringify({
    id: "evt_1",
    object: "event",
    type,
    data: { object: session },
  });
  return {
    body: Buffer.from(payload, "utf8"),
    signature: Stripe.webhooks.generateTestHeaderString({ payload, secret }),
  };
};

const session = {
  id: "cs_test_1",
  object: "checkout.session",

  payment_intent: "pi_test_1",

  payment_status: "paid",
  amount_total: 2445,
  currency: "egp",
  metadata: { orderId: "order_1", transactionId: "txn_1" },
};

const pendingPayment = {
  id: "txn_1",
  status: "PENDING",
  paymentMethod: "CREDIT_CARD",
  type: "ORDER_PAYMENT",
  amount: new Prisma.Decimal("24.45"),
  currency: "EGP",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedOrders.transaction.mockImplementation(
    async (cb: (client: never) => Promise<unknown>) => cb(tx),
  );
  mockedOrders.findById.mockResolvedValue({
    id: "order_1",
    customerId: "cust_1",
    status: "PENDING",
  } as never);
  mockedOrders.appendTimelineEntry.mockResolvedValue({
    status: "CONFIRMED",
  } as never);
  mockedTransactions.findPendingGatewayPayment.mockResolvedValue(
    pendingPayment as never,
  );
});

describe("the signature is the authentication", () => {
  it("accepts a body genuinely signed with our secret", () => {
    const { body, signature } = signedEvent(
      "checkout.session.completed",
      session,
    );

    const event = paymentWebhookService.constructEvent(body, signature);

    expect(event.type).toBe("checkout.session.completed");
  });

  it("rejects a body that was altered after signing", () => {
    const { signature } = signedEvent("checkout.session.completed", session);

    const tampered = Buffer.from(
      JSON.stringify({
        id: "evt_1",
        object: "event",
        type: "checkout.session.completed",
        data: { object: { ...session, metadata: { orderId: "order_999" } } },
      }),
      "utf8",
    );

    expect(() =>
      paymentWebhookService.constructEvent(tampered, signature),
    ).toThrow(paymentErrors.WEBHOOK_SIGNATURE_INVALID.message);
  });

  it("rejects a body signed with the wrong secret", () => {
    const { body, signature } = signedEvent(
      "checkout.session.completed",
      session,
      "whsec_an_attackers_own_secret",
    );

    expect(() => paymentWebhookService.constructEvent(body, signature)).toThrow(
      paymentErrors.WEBHOOK_SIGNATURE_INVALID.message,
    );
  });

  it("rejects a request with no signature header at all", () => {
    const { body } = signedEvent("checkout.session.completed", session);

    expect(() => paymentWebhookService.constructEvent(body, undefined)).toThrow(
      paymentErrors.WEBHOOK_SIGNATURE_INVALID.message,
    );
  });

  it("answers 400 so a forged call is never retried", () => {
    const { body } = signedEvent("checkout.session.completed", session);

    try {
      paymentWebhookService.constructEvent(body, "t=1,v1=deadbeef");
      expect.unreachable("should have rejected the signature");
    } catch (error) {
      expect(error).toMatchObject({ statusCode: 400 });
    }
  });
});

describe("a completed checkout settles the payment and confirms the order", () => {
  const completed = {
    id: "evt_1",
    type: "checkout.session.completed",
    data: { object: session },
  } as never;

  it("marks the pending payment SUCCESS", async () => {
    await paymentWebhookService.handleEvent(completed);

    expect(mockedTransactions.recordGatewayOutcome).toHaveBeenCalledWith(
      "txn_1",
      "SUCCESS",
      expect.anything(),
      tx,
    );
  });

  it("captures the PaymentIntent id, without which no refund is possible", async () => {
    await paymentWebhookService.handleEvent(completed);

    expect(mockedTransactions.recordGatewayOutcome).toHaveBeenCalledWith(
      "txn_1",
      "SUCCESS",
      expect.objectContaining({
        metadata: expect.objectContaining({ paymentIntentId: "pi_test_1" }),
      }),
      tx,
    );
  });

  it("advances the order only from PENDING", async () => {
    await paymentWebhookService.handleEvent(completed);

    expect(mockedOrders.appendTimelineEntry).toHaveBeenCalledWith(
      "order_1",
      expect.objectContaining({ status: "CONFIRMED" }),
      "PENDING",
      tx,
    );
  });

  it("settles the payment and the order in one transaction", async () => {
    await paymentWebhookService.handleEvent(completed);

    expect(mockedTransactions.recordGatewayOutcome).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      tx,
    );
    expect(mockedOrders.appendTimelineEntry).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      tx,
    );
  });

  it("tells the customer their order is confirmed", async () => {
    await paymentWebhookService.handleEvent(completed);

    expect(mockedNotifications.notifyOrderStatusChanged).toHaveBeenCalledWith(
      "cust_1",
      "order_1",
      "CONFIRMED",
    );
  });

  it("still records the payment when the order has already moved on", async () => {
    mockedOrders.appendTimelineEntry.mockResolvedValue(null as never);

    await paymentWebhookService.handleEvent(completed);

    expect(mockedTransactions.recordGatewayOutcome).toHaveBeenCalledWith(
      "txn_1",
      "SUCCESS",
      expect.anything(),
      tx,
    );
    expect(mockedNotifications.notifyOrderStatusChanged).not.toHaveBeenCalled();
  });

  it("drops an event carrying no orderId instead of guessing", async () => {
    await paymentWebhookService.handleEvent({
      id: "evt_2",
      type: "checkout.session.completed",
      data: { object: { id: "cs_x", metadata: {} } },
    } as never);

    expect(mockedTransactions.recordGatewayOutcome).not.toHaveBeenCalled();
  });
});

describe("the settled amount is checked before the payment is accepted", () => {
  const completedWith = (over: Record<string, unknown>) =>
    ({
      id: "evt_v",
      type: "checkout.session.completed",
      data: { object: { ...session, ...over } },
    }) as never;

  it("refuses to settle an order for 24.45 with a session for 0.01", async () => {
    await paymentWebhookService.handleEvent(completedWith({ amount_total: 1 }));

    expect(mockedTransactions.recordGatewayOutcome).not.toHaveBeenCalled();
    expect(mockedOrders.appendTimelineEntry).not.toHaveBeenCalled();
    expect(mockedNotifications.notifyOrderStatusChanged).not.toHaveBeenCalled();
  });

  it("refuses a session in a different currency", async () => {
    await paymentWebhookService.handleEvent(completedWith({ currency: "usd" }));

    expect(mockedTransactions.recordGatewayOutcome).not.toHaveBeenCalled();
  });

  it("leaves the row PENDING rather than marking it FAILED", async () => {
    await paymentWebhookService.handleEvent(completedWith({ amount_total: 1 }));

    expect(mockedTransactions.recordGatewayOutcome).not.toHaveBeenCalled();
    expect(mockedTransactions.attachGatewayReference).toHaveBeenCalledWith(
      "txn_1",
      expect.objectContaining({
        metadata: expect.objectContaining({
          stage: "verification_failed",
          reason: "amount_mismatch",
          expected: "2445",
          received: "1",
        }),
      }),
      tx,
    );
  });

  it("does not throw, because redelivering will not change the numbers", async () => {
    await expect(
      paymentWebhookService.handleEvent(completedWith({ amount_total: 1 })),
    ).resolves.toBeUndefined();
  });

  it("still settles a session that matches exactly", async () => {
    await paymentWebhookService.handleEvent(completedWith({}));

    expect(mockedTransactions.recordGatewayOutcome).toHaveBeenCalledWith(
      "txn_1",
      "SUCCESS",
      expect.anything(),
      tx,
    );
  });
});

describe("a completed checkout is not necessarily a paid one", () => {
  const withStatus = (payment_status: string, type: string) =>
    ({
      id: "evt_d",
      type,
      data: { object: { ...session, payment_status } },
    }) as never;

  it("does not settle a session Stripe reports as unpaid", async () => {
    await paymentWebhookService.handleEvent(
      withStatus("unpaid", "checkout.session.completed"),
    );

    expect(mockedTransactions.recordGatewayOutcome).not.toHaveBeenCalled();
    expect(mockedOrders.appendTimelineEntry).not.toHaveBeenCalled();
  });

  it("does not flag an unpaid session as a discrepancy", async () => {
    await paymentWebhookService.handleEvent(
      withStatus("unpaid", "checkout.session.completed"),
    );

    expect(mockedTransactions.attachGatewayReference).not.toHaveBeenCalled();
  });

  it("settles it when the delayed payment finally succeeds", async () => {
    await paymentWebhookService.handleEvent(
      withStatus("paid", "checkout.session.async_payment_succeeded"),
    );

    expect(mockedTransactions.recordGatewayOutcome).toHaveBeenCalledWith(
      "txn_1",
      "SUCCESS",
      expect.anything(),
      tx,
    );
  });

  it("checks the amount on the delayed event too", async () => {
    await paymentWebhookService.handleEvent({
      id: "evt_d2",
      type: "checkout.session.async_payment_succeeded",
      data: { object: { ...session, amount_total: 1 } },
    } as never);

    expect(mockedTransactions.recordGatewayOutcome).not.toHaveBeenCalled();
  });
});

describe("redelivery cannot apply the same event twice", () => {
  const completed = {
    id: "evt_1",
    type: "checkout.session.completed",
    data: { object: session },
  } as never;

  it("does nothing on a replayed completion", async () => {
    mockedTransactions.findPendingGatewayPayment.mockResolvedValue(null);

    await paymentWebhookService.handleEvent(completed);

    expect(mockedTransactions.recordGatewayOutcome).not.toHaveBeenCalled();
    expect(mockedOrders.appendTimelineEntry).not.toHaveBeenCalled();
    expect(mockedNotifications.notifyOrderStatusChanged).not.toHaveBeenCalled();
  });

  it("does not throw on a replay, so Stripe stops retrying", async () => {
    mockedTransactions.findPendingGatewayPayment.mockResolvedValue(null);

    await expect(
      paymentWebhookService.handleEvent(completed),
    ).resolves.toBeUndefined();
  });

  it("does not cancel twice on a replayed expiry", async () => {
    mockedTransactions.findPendingGatewayPayment.mockResolvedValue(null);

    await paymentWebhookService.handleEvent({
      id: "evt_3",
      type: "checkout.session.expired",
      data: { object: session },
    } as never);

    expect(mockedOrderService.cancelOrder).not.toHaveBeenCalled();
  });
});

describe("an unpaid checkout releases what the order was holding", () => {
  const expired = {
    id: "evt_4",
    type: "checkout.session.expired",
    data: { object: session },
  } as never;

  it("cancels the order, which returns the reserved stock", async () => {
    await paymentWebhookService.handleEvent(expired);

    expect(mockedOrderService.cancelOrder).toHaveBeenCalledWith(
      "cust_1",
      "order_1",
    );
  });

  it("treats a declined delayed payment the same way", async () => {
    await paymentWebhookService.handleEvent({
      id: "evt_5",
      type: "checkout.session.async_payment_failed",
      data: { object: session },
    } as never);

    expect(mockedOrderService.cancelOrder).toHaveBeenCalledWith(
      "cust_1",
      "order_1",
    );
  });

  it("leaves an order alone once it is no longer PENDING", async () => {
    mockedOrders.findById.mockResolvedValue({
      id: "order_1",
      customerId: "cust_1",
      status: "PREPARING",
    } as never);

    await paymentWebhookService.handleEvent(expired);

    expect(mockedOrderService.cancelOrder).not.toHaveBeenCalled();
  });

  it("ignores an event for an order that does not exist", async () => {
    mockedOrders.findById.mockResolvedValue(null);

    await paymentWebhookService.handleEvent(expired);

    expect(mockedOrderService.cancelOrder).not.toHaveBeenCalled();
  });
});

describe("refund events keep our ledger honest", () => {
  const refundEvent = (status: string, id = "re_1") =>
    ({
      id: "evt_r",
      type: "refund.updated",
      data: { object: { id, object: "refund", status } },
    }) as never;

  const pendingRefund = {
    id: "txn_refund_1",
    type: "REFUND",
    status: "PENDING",
    orderId: "order_1",
  };

  it("marks a pending refund SUCCESS once Stripe says it succeeded", async () => {
    mockedTransactions.findByExternalRef.mockResolvedValue(
      pendingRefund as never,
    );

    await paymentWebhookService.handleEvent(refundEvent("succeeded"));

    expect(mockedTransactions.recordGatewayOutcome).toHaveBeenCalledWith(
      "txn_refund_1",
      "SUCCESS",
      expect.anything(),
    );
  });

  it("marks it FAILED when the refund fails — money still owed", async () => {
    mockedTransactions.findByExternalRef.mockResolvedValue(
      pendingRefund as never,
    );

    await paymentWebhookService.handleEvent(refundEvent("failed"));

    expect(mockedTransactions.recordGatewayOutcome).toHaveBeenCalledWith(
      "txn_refund_1",
      "FAILED",
      expect.anything(),
    );
  });

  it("leaves it PENDING while Stripe still says pending", async () => {
    mockedTransactions.findByExternalRef.mockResolvedValue(
      pendingRefund as never,
    );

    await paymentWebhookService.handleEvent(refundEvent("pending"));

    expect(mockedTransactions.recordGatewayOutcome).not.toHaveBeenCalled();
  });

  it("ignores a refund issued outside this system", async () => {
    mockedTransactions.findByExternalRef.mockResolvedValue(null);

    await paymentWebhookService.handleEvent(refundEvent("succeeded", "re_x"));

    expect(mockedTransactions.recordGatewayOutcome).not.toHaveBeenCalled();
  });

  it("refuses to treat a payment row as a refund", async () => {
    mockedTransactions.findByExternalRef.mockResolvedValue({
      id: "txn_1",
      type: "ORDER_PAYMENT",
      status: "SUCCESS",
    } as never);

    await paymentWebhookService.handleEvent(refundEvent("failed"));

    expect(mockedTransactions.recordGatewayOutcome).not.toHaveBeenCalled();
  });

  it("is safe to redeliver once the refund has settled", async () => {
    mockedTransactions.findByExternalRef.mockResolvedValue({
      ...pendingRefund,
      status: "SUCCESS",
    } as never);

    await paymentWebhookService.handleEvent(refundEvent("succeeded"));

    expect(mockedTransactions.recordGatewayOutcome).not.toHaveBeenCalled();
  });
});

describe("unrecognised events", () => {
  it("acknowledges without touching anything", async () => {
    await expect(
      paymentWebhookService.handleEvent({
        id: "evt_6",
        type: "payment_intent.created",
        data: { object: {} },
      } as never),
    ).resolves.toBeUndefined();

    expect(mockedTransactions.recordGatewayOutcome).not.toHaveBeenCalled();
    expect(mockedOrderService.cancelOrder).not.toHaveBeenCalled();
  });
});
