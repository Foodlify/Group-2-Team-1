/**
 * Stripe webhook handling.
 *
 * This endpoint is public and unauthenticated by design — Stripe calls it from
 * its own servers with no session — so two properties carry the whole weight:
 *
 *   1. the signature check is the ONLY thing standing between a forged POST
 *      and an order marked paid;
 *   2. handling is idempotent, because Stripe redelivers events for up to
 *      three days and can send the same one more than once.
 *
 * The signature tests use the real SDK and real HMAC, not a mock. A mocked
 * `constructEvent` that returns whatever it is handed would pass while the
 * endpoint trusted anything — the exact failure worth testing for.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";

// `vi.hoisted` because the `vi.mock` factory below is lifted above every
// top-level statement — a plain const would not exist yet when it runs.
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

/** Builds a payload plus the header Stripe would really send for it. */
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
  metadata: { orderId: "order_1", transactionId: "txn_1" },
};

const pendingPayment = {
  id: "txn_1",
  status: "PENDING",
  paymentMethod: "CREDIT_CARD",
  type: "ORDER_PAYMENT",
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

// ═══════════════════════════════════════════════════════════
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
    // Same signature, different payload — someone replaying a captured call
    // against an order of their choosing.
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
      // Stripe treats 4xx as "stop retrying". A 5xx here would have it hammer
      // the endpoint for three days over a request that will never be valid.
      expect(error).toMatchObject({ statusCode: 400 });
    }
  });
});

// ═══════════════════════════════════════════════════════════
describe("a completed checkout settles the payment and confirms the order", () => {
  const completed = {
    id: "evt_1",
    type: "checkout.session.completed",
    data: { object: session },
  } as never;

  it("marks the pending payment SUCCESS", async () => {
    await paymentWebhookService.handleEvent(completed);

    expect(mockedTransactions.updateStatus).toHaveBeenCalledWith(
      "txn_1",
      "SUCCESS",
      tx,
    );
  });

  it("advances the order only from PENDING", async () => {
    await paymentWebhookService.handleEvent(completed);

    // The expected-status argument is what makes this safe against a
    // concurrent admin update: without it the webhook could drag a CANCELLED
    // order back to CONFIRMED.
    expect(mockedOrders.appendTimelineEntry).toHaveBeenCalledWith(
      "order_1",
      expect.objectContaining({ status: "CONFIRMED" }),
      "PENDING",
      tx,
    );
  });

  it("settles the payment and the order in one transaction", async () => {
    await paymentWebhookService.handleEvent(completed);

    // Both writes must land together: a SUCCESS payment on an order still
    // showing PENDING is a customer who paid and sees nothing happen.
    expect(mockedTransactions.updateStatus).toHaveBeenCalledWith(
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
    // Conditional update matched nothing: the order is no longer PENDING.
    mockedOrders.appendTimelineEntry.mockResolvedValue(null as never);

    await paymentWebhookService.handleEvent(completed);

    // Money arriving is a fact regardless of the order's status.
    expect(mockedTransactions.updateStatus).toHaveBeenCalledWith(
      "txn_1",
      "SUCCESS",
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

    expect(mockedTransactions.updateStatus).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════
describe("redelivery cannot apply the same event twice", () => {
  const completed = {
    id: "evt_1",
    type: "checkout.session.completed",
    data: { object: session },
  } as never;

  it("does nothing on a replayed completion", async () => {
    // What the second delivery sees: the payment is no longer pending.
    mockedTransactions.findPendingGatewayPayment.mockResolvedValue(null);

    await paymentWebhookService.handleEvent(completed);

    expect(mockedTransactions.updateStatus).not.toHaveBeenCalled();
    expect(mockedOrders.appendTimelineEntry).not.toHaveBeenCalled();
    expect(mockedNotifications.notifyOrderStatusChanged).not.toHaveBeenCalled();
  });

  it("does not throw on a replay, so Stripe stops retrying", async () => {
    mockedTransactions.findPendingGatewayPayment.mockResolvedValue(null);

    // A throw here becomes a 500, which Stripe reads as "not delivered" and
    // retries — forever, on an event that is already applied.
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

// ═══════════════════════════════════════════════════════════
describe("an unpaid checkout releases what the order was holding", () => {
  const expired = {
    id: "evt_4",
    type: "checkout.session.expired",
    data: { object: session },
  } as never;

  it("cancels the order, which returns the reserved stock", async () => {
    await paymentWebhookService.handleEvent(expired);

    // Cancelling is reused rather than reimplemented precisely because it
    // already releases stock and marks the pending payment FAILED.
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

// ═══════════════════════════════════════════════════════════
describe("unrecognised events", () => {
  it("acknowledges without touching anything", async () => {
    await expect(
      paymentWebhookService.handleEvent({
        id: "evt_6",
        type: "payment_intent.created",
        data: { object: {} },
      } as never),
    ).resolves.toBeUndefined();

    expect(mockedTransactions.updateStatus).not.toHaveBeenCalled();
    expect(mockedOrderService.cancelOrder).not.toHaveBeenCalled();
  });
});
