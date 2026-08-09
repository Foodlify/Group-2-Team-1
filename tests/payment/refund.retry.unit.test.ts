/**
 * Retrying an unsettled refund.
 *
 * There is exactly one way this feature can be catastrophic: paying a customer
 * twice. That happens when a refund actually succeeded at the gateway, we
 * failed to record it, and the retry sends another one.
 *
 * Stripe's idempotency key does not save us — it expires after 24 hours, and a
 * retry is by definition later than the attempt it retries. So the strategy
 * asks the gateway what it already holds before creating anything, and most of
 * this file exists to prove that lookup is really there and really used.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const createRefund = vi.fn();
const listRefunds = vi.fn();
const retrieveSession = vi.fn();

vi.mock("../../src/modules/payment/stripe.client", () => ({
  getStripe: () => ({
    refunds: { create: createRefund, list: listRefunds },
    checkout: { sessions: { retrieve: retrieveSession } },
  }),
  isStripeConfigured: () => true,
}));

vi.mock("../../src/config/env", () => ({
  default: {
    STRIPE_SUCCESS_URL: "https://shop.example/paid",
    STRIPE_CANCEL_URL: "https://shop.example/cancelled",
  },
}));

vi.mock("../../src/modules/transaction/transaction.service", () => ({
  transactionService: {
    findById: vi.fn(),
    findPaymentForRefund: vi.fn(),
    findOutstandingRefunds: vi.fn(),
    recordGatewayOutcome: vi.fn(),
    createTransaction: vi.fn(),
    attachGatewayReference: vi.fn(),
  },
}));

import { paymentService } from "../../src/modules/payment/payment.service";
import { stripeCardStrategy } from "../../src/modules/payment/stripe.strategy";
import { transactionService } from "../../src/modules/transaction/transaction.service";
import { paymentErrors } from "../../src/shared/exceptions/payment.errors";

const mockedTransactions = vi.mocked(transactionService);

const now = new Date("2026-08-09T10:00:00.000Z");

const refundRow = (over: Record<string, unknown> = {}) =>
  ({
    id: "txn_ref_1",
    type: "REFUND",
    status: "FAILED",
    amount: 91,
    currency: "EGP",
    paymentMethod: "CREDIT_CARD",
    internalTxNumber: "REF-1",
    externalRef: null,
    orderId: "order_1",
    metadata: { error: "card network unavailable" },
    createdAt: now,
    updatedAt: now,
    ...over,
  }) as never;

const paymentRow = {
  id: "txn_pay_1",
  type: "ORDER_PAYMENT",
  status: "SUCCESS",
  paymentMethod: "CREDIT_CARD",
  orderId: "order_1",
  amount: 91,
  externalRef: "cs_test_1",
  metadata: { paymentIntentId: "pi_1" },
} as never;

beforeEach(() => {
  vi.clearAllMocks();
  listRefunds.mockResolvedValue({ data: [] });
  createRefund.mockResolvedValue({ id: "re_new", status: "succeeded" });
  mockedTransactions.findById.mockResolvedValue(refundRow());
  mockedTransactions.findPaymentForRefund.mockResolvedValue(paymentRow);
});

// ═══════════════════════════════════════════════════════════
describe("a retry can never pay the customer twice", () => {
  it("asks the gateway what it already holds before creating anything", async () => {
    await stripeCardStrategy.refund(refundRow(), paymentRow, 91);

    expect(listRefunds).toHaveBeenCalledWith({
      payment_intent: "pi_1",
      limit: 100,
    });
    const lookup = listRefunds.mock.invocationCallOrder[0]!;
    const create = createRefund.mock.invocationCallOrder[0]!;
    expect(lookup).toBeLessThan(create);
  });

  it("adopts an existing refund instead of sending a second one", async () => {
    // What a retry sees when the first attempt actually worked and we simply
    // failed to write down that it had.
    listRefunds.mockResolvedValue({
      data: [
        {
          id: "re_already",
          status: "succeeded",
          metadata: { refundTransactionId: "txn_ref_1" },
        },
      ],
    });

    const outcome = await stripeCardStrategy.refund(
      refundRow(),
      paymentRow,
      91,
    );

    expect(createRefund).not.toHaveBeenCalled();
    expect(outcome.status).toBe("SUCCESS");
    expect(outcome.externalRef).toBe("re_already");
  });

  it("marks an adopted refund as reconciled, not newly sent", async () => {
    listRefunds.mockResolvedValue({
      data: [
        {
          id: "re_already",
          status: "succeeded",
          metadata: { refundTransactionId: "txn_ref_1" },
        },
      ],
    });

    const outcome = await stripeCardStrategy.refund(
      refundRow(),
      paymentRow,
      91,
    );

    // The ledger should show this money was already gone, not that we moved it.
    expect(outcome.metadata).toMatchObject({ reconciled: true });
  });

  it("ignores a refund belonging to a different ledger row", async () => {
    // Two refunds of the same order for the same amount are identical by
    // value. Matching on anything but our own id would settle one obligation
    // with the other one's money.
    listRefunds.mockResolvedValue({
      data: [
        {
          id: "re_other",
          status: "succeeded",
          metadata: { refundTransactionId: "txn_ref_SOMEONE_ELSE" },
        },
      ],
    });

    await stripeCardStrategy.refund(refundRow(), paymentRow, 91);

    expect(createRefund).toHaveBeenCalled();
  });

  it("ignores a refund issued by hand from the dashboard", async () => {
    // No metadata: a human refunding manually is not evidence that THIS row
    // was paid, and adopting it would close an obligation nobody settled.
    listRefunds.mockResolvedValue({
      data: [{ id: "re_manual", status: "succeeded", metadata: {} }],
    });

    await stripeCardStrategy.refund(refundRow(), paymentRow, 91);

    expect(createRefund).toHaveBeenCalled();
  });

  it("still keys the create request for idempotency", async () => {
    await stripeCardStrategy.refund(refundRow(), paymentRow, 91);

    // Belt and braces: the lookup covers retries days later, the key covers
    // two requests racing within the same window.
    const [, options] = createRefund.mock.calls[0]!;
    expect(options.idempotencyKey).toBe("refund-txn_ref_1");
  });
});

// ═══════════════════════════════════════════════════════════
describe("retrying through the service", () => {
  it("settles the refund and reports its new state", async () => {
    mockedTransactions.findById
      .mockResolvedValueOnce(refundRow())
      .mockResolvedValueOnce(
        refundRow({ status: "SUCCESS", externalRef: "re_new", metadata: {} }),
      );

    const result = await paymentService.retryRefund("txn_ref_1");

    // Re-read after the attempt — returning the row we started with would tell
    // the admin nothing changed.
    expect(result.status).toBe("SUCCESS");
    expect(result.externalRef).toBe("re_new");
  });

  it("surfaces the failure reason when it fails again", async () => {
    mockedTransactions.findById.mockResolvedValue(
      refundRow({ metadata: { error: "card network unavailable" } }),
    );

    const result = await paymentService.retryRefund("txn_ref_1");

    // Lifted out of the metadata blob: "why is this still owed" is the whole
    // reason someone is looking at it.
    expect(result.error).toBe("card network unavailable");
  });

  it("404s an id that is not a refund", async () => {
    mockedTransactions.findById.mockResolvedValue({
      id: "txn_pay_1",
      type: "ORDER_PAYMENT",
    } as never);

    await expect(paymentService.retryRefund("txn_pay_1")).rejects.toMatchObject(
      { statusCode: paymentErrors.REFUND_NOT_FOUND.statusCode },
    );
  });

  it("404s an unknown id", async () => {
    mockedTransactions.findById.mockResolvedValue(null);

    await expect(paymentService.retryRefund("nope")).rejects.toMatchObject({
      statusCode: paymentErrors.REFUND_NOT_FOUND.statusCode,
    });
  });

  it("refuses to retry a refund that already succeeded", async () => {
    mockedTransactions.findById.mockResolvedValue(
      refundRow({ status: "SUCCESS" }),
    );

    await expect(paymentService.retryRefund("txn_ref_1")).rejects.toMatchObject(
      { statusCode: paymentErrors.REFUND_ALREADY_SETTLED.statusCode },
    );
    expect(createRefund).not.toHaveBeenCalled();
  });

  it("retries a PENDING refund, not just a FAILED one", async () => {
    // A refund stuck PENDING for days is as much an unpaid obligation as a
    // failed one, and the gateway lookup makes chasing it safe.
    mockedTransactions.findById.mockResolvedValue(
      refundRow({ status: "PENDING" }),
    );

    await paymentService.retryRefund("txn_ref_1");

    expect(mockedTransactions.recordGatewayOutcome).toHaveBeenCalled();
  });

  it("fails the refund when the order has no successful payment", async () => {
    mockedTransactions.findPaymentForRefund.mockResolvedValue(null);

    await expect(paymentService.retryRefund("txn_ref_1")).rejects.toMatchObject(
      { statusCode: paymentErrors.REFUND_NO_PAYMENT.statusCode },
    );
    // Recorded, not just refused: there is no money to return, and the row
    // should stop looking like something a retry could fix.
    expect(mockedTransactions.recordGatewayOutcome).toHaveBeenCalledWith(
      "txn_ref_1",
      "FAILED",
      expect.objectContaining({
        metadata: expect.objectContaining({
          error: expect.stringContaining("no successful payment"),
        }),
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════
describe("the outstanding list", () => {
  it("returns unsettled refunds in API shape", async () => {
    mockedTransactions.findOutstandingRefunds.mockResolvedValue([
      refundRow(),
      refundRow({ id: "txn_ref_2", status: "PENDING", metadata: {} }),
    ] as never);

    const rows = await paymentService.outstandingRefunds();

    expect(rows).toHaveLength(2);
    expect(rows[0]!.error).toBe("card network unavailable");
    expect(rows[1]!.error).toBeNull();
    expect(rows[0]!.amount).toBe(91);
  });

  it("passes the caller's limit through", async () => {
    mockedTransactions.findOutstandingRefunds.mockResolvedValue([]);

    await paymentService.outstandingRefunds(5);

    expect(mockedTransactions.findOutstandingRefunds).toHaveBeenCalledWith(5);
  });
});
