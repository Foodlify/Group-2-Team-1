/**
 * Refunds — returning money through the gateway.
 *
 * The risk here is the opposite of the one at checkout. There, a failure means
 * a customer cannot pay us. Here, a failure means we keep money that is not
 * ours — and the worst version of that is a ledger row saying the money went
 * back when it did not. So these tests care about two things above all:
 *
 *   1. a REFUND is never SUCCESS until the gateway confirms it;
 *   2. a failure is always *recorded*, never swallowed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/modules/transaction/transaction.service", () => ({
  transactionService: {
    createTransaction: vi.fn(),
    attachGatewayReference: vi.fn(),
    recordGatewayOutcome: vi.fn(),
  },
}));

import { paymentService } from "../../src/modules/payment/payment.service";
import { transactionService } from "../../src/modules/transaction/transaction.service";
import { StripeCardStrategy } from "../../src/modules/payment/stripe.strategy";

const mockedTransactions = vi.mocked(transactionService);

const payment = {
  id: "txn_pay_1",
  type: "ORDER_PAYMENT",
  status: "SUCCESS",
  paymentMethod: "WALLET",
  orderId: "order_1",
  amount: 60,
} as never;

const refundRow = {
  id: "txn_ref_1",
  type: "REFUND",
  status: "PENDING",
  paymentMethod: "WALLET",
  orderId: "order_1",
  amount: 60,
} as never;

/** Registers a throwaway gateway whose refund behaviour the test controls. */
const registerGateway = (refund?: (...args: never[]) => Promise<unknown>) => {
  paymentService.register({
    method: "WALLET",
    pay: async () => ({ status: "PENDING" as const }),
    ...(refund ? { refund: refund as never } : {}),
  });
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("a successful refund is recorded with the gateway's reference", () => {
  it("settles the REFUND row SUCCESS and stores the refund id", async () => {
    registerGateway(async () => ({
      status: "SUCCESS",
      externalRef: "re_123",
      metadata: { gateway: "fake" },
    }));

    await paymentService.refundPayments([{ refund: refundRow, payment }]);

    expect(mockedTransactions.recordGatewayOutcome).toHaveBeenCalledWith(
      "txn_ref_1",
      "SUCCESS",
      { externalRef: "re_123", metadata: { gateway: "fake" } },
    );
  });

  it("passes the refund's own amount, not the order total", async () => {
    const seen: unknown[] = [];
    registerGateway(async (...args: unknown[]) => {
      seen.push(args[2]);
      return { status: "SUCCESS" };
    });

    await paymentService.refundPayments([
      { refund: { ...(refundRow as object), amount: 45.5 } as never, payment },
    ]);

    expect(seen[0]).toBe(45.5);
  });

  it("keeps a gateway-pending refund PENDING rather than claiming success", async () => {
    registerGateway(async () => ({ status: "PENDING", externalRef: "re_p" }));

    await paymentService.refundPayments([{ refund: refundRow, payment }]);

    // The customer does not have their money yet. Saying SUCCESS here would be
    // a lie the ledger never recovers from.
    expect(mockedTransactions.recordGatewayOutcome).toHaveBeenCalledWith(
      "txn_ref_1",
      "PENDING",
      expect.anything(),
    );
  });
});

describe("a failed refund is never silent", () => {
  it("marks the REFUND row FAILED when the gateway throws", async () => {
    registerGateway(async () => {
      throw new Error("card network unavailable");
    });

    await paymentService.refundPayments([{ refund: refundRow, payment }]);

    expect(mockedTransactions.recordGatewayOutcome).toHaveBeenCalledWith(
      "txn_ref_1",
      "FAILED",
      expect.objectContaining({
        metadata: expect.objectContaining({
          error: "card network unavailable",
        }),
      }),
    );
  });

  it("does not throw — the cancellation already succeeded", async () => {
    registerGateway(async () => {
      throw new Error("boom");
    });

    // Throwing would fail the customer's cancel request even though the order
    // IS cancelled and the stock IS back. The refund is a separate obligation,
    // tracked by its own row.
    await expect(
      paymentService.refundPayments([{ refund: refundRow, payment }]),
    ).resolves.toBeUndefined();
  });

  it("keeps refunding the rest after one fails", async () => {
    let call = 0;
    registerGateway(async () => {
      call += 1;
      if (call === 1) throw new Error("first fails");
      return { status: "SUCCESS", externalRef: "re_ok" };
    });

    await paymentService.refundPayments([
      { refund: refundRow, payment },
      {
        refund: { ...(refundRow as object), id: "txn_ref_2" } as never,
        payment,
      },
    ]);

    expect(mockedTransactions.recordGatewayOutcome).toHaveBeenNthCalledWith(
      1,
      "txn_ref_1",
      "FAILED",
      expect.anything(),
    );
    expect(mockedTransactions.recordGatewayOutcome).toHaveBeenNthCalledWith(
      2,
      "txn_ref_2",
      "SUCCESS",
      expect.anything(),
    );
  });

  it("fails loudly when no strategy can return the money", async () => {
    // Registered without a `refund` implementation at all.
    registerGateway();

    await paymentService.refundPayments([{ refund: refundRow, payment }]);

    // Leaving it PENDING would look like work in progress forever. FAILED is
    // what gets a human to look at it.
    expect(mockedTransactions.recordGatewayOutcome).toHaveBeenCalledWith(
      "txn_ref_1",
      "FAILED",
      expect.objectContaining({
        metadata: expect.objectContaining({
          error: expect.stringContaining("no refund strategy"),
        }),
      }),
    );
  });

  it("does nothing at all when there is nothing to refund", async () => {
    await paymentService.refundPayments([]);

    expect(mockedTransactions.recordGatewayOutcome).not.toHaveBeenCalled();
  });
});

describe("Stripe's refund lifecycle maps onto our three states", () => {
  it.each([
    ["succeeded", "SUCCESS"],
    ["failed", "FAILED"],
    ["canceled", "FAILED"],
    ["pending", "PENDING"],
    ["requires_action", "PENDING"],
    [null, "PENDING"],
  ])("%s -> %s", (stripeStatus, expected) => {
    expect(StripeCardStrategy.toTransactionStatus(stripeStatus)).toBe(expected);
  });

  it("treats an unrecognised status as PENDING, not SUCCESS", () => {
    // Stripe types this as a plain string, so a new value is possible. The
    // safe default is "not finished" — never "money returned".
    expect(StripeCardStrategy.toTransactionStatus("some_new_status")).toBe(
      "PENDING",
    );
  });
});
