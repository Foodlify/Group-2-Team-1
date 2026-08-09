/**
 * Payment service — strategy routing and the two-phase split.
 *
 * The rule this file defends: the API must never advertise a payment method it
 * cannot process. `SUPPORTED_PAYMENT_METHODS` (what request validation accepts)
 * and the registered strategies (what actually runs) are derived from the same
 * condition, and a drift between them is a 500 in a customer's checkout.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/modules/transaction/transaction.service", () => ({
  transactionService: {
    createTransaction: vi.fn(),
    attachGatewayReference: vi.fn(),
  },
}));

import { paymentService } from "../../src/modules/payment/payment.service";
import { transactionService } from "../../src/modules/transaction/transaction.service";
import { SUPPORTED_PAYMENT_METHODS } from "../../src/modules/transaction/transaction.model";
import { paymentErrors } from "../../src/shared/exceptions/payment.errors";

const mockedTransactions = vi.mocked(transactionService);

const context = { orderId: "order_1", customerId: "cust_1", currency: "EGP" };

beforeEach(() => {
  vi.clearAllMocks();
  mockedTransactions.createTransaction.mockResolvedValue({
    id: "txn_1",
  } as never);
});

describe("the advertised methods match the registered strategies", () => {
  it("accepts exactly the methods that have a strategy behind them", () => {
    // This is the invariant, not the specific list: whatever the environment
    // enables, validation and execution must agree. Asserting the two sets are
    // equal catches a strategy registered without opening the schema, and a
    // schema opened without a strategy — which would 500 mid-checkout.
    expect([...SUPPORTED_PAYMENT_METHODS].sort()).toEqual(
      paymentService.supportedMethods().sort(),
    );
  });

  it("always supports cash on delivery", () => {
    // Cash needs no configuration, so it can never be switched off by a
    // missing key.
    expect(paymentService.supportedMethods()).toContain("CASH");
  });

  it("does not offer card payments without Stripe configured", () => {
    // The unit test environment has no STRIPE_SECRET_KEY.
    expect(paymentService.supportedMethods()).not.toContain("CREDIT_CARD");
    expect(SUPPORTED_PAYMENT_METHODS).not.toContain("CREDIT_CARD");
  });

  it("rejects a method with no strategy as a 400, not a crash", async () => {
    await expect(
      paymentService.processPayment("PAYPAL", 10, context),
    ).rejects.toMatchObject({
      message: paymentErrors.UNSUPPORTED_METHOD.message,
      statusCode: paymentErrors.UNSUPPORTED_METHOD.statusCode,
    });
  });
});

describe("processPayment records the payment", () => {
  it("writes a PENDING order payment for cash", async () => {
    await paymentService.processPayment("CASH", 60, context);

    expect(mockedTransactions.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ORDER_PAYMENT",
        amount: 60,
        currency: "EGP",
        status: "PENDING",
        paymentMethod: "CASH",
        orderId: "order_1",
      }),
      undefined,
    );
  });

  it("passes the caller's transaction client through", async () => {
    const tx = { __brand: "tx" } as never;

    await paymentService.processPayment("CASH", 60, context, tx);

    expect(mockedTransactions.createTransaction).toHaveBeenCalledWith(
      expect.anything(),
      tx,
    );
  });
});

describe("initiatePayment is a no-op without a gateway", () => {
  it("returns no redirect for cash and writes nothing", async () => {
    const result = await paymentService.initiatePayment(
      "CASH",
      { id: "txn_1" } as never,
      60,
      context,
    );

    expect(result).toEqual({});
    expect(result.redirectUrl).toBeUndefined();
    // No gateway means no reference to record — an update here would be a
    // pointless write on every single cash order.
    expect(mockedTransactions.attachGatewayReference).not.toHaveBeenCalled();
  });
});

describe("initiatePayment persists what the gateway returned", () => {
  const transaction = { id: "txn_1" } as never;

  /** Registers a throwaway gateway strategy for the duration of a test. */
  const registerFakeGateway = (
    initiate: (...args: never[]) => Promise<unknown>,
  ) => {
    paymentService.register({
      method: "WALLET",
      pay: async () => ({ status: "PENDING" as const }),
      initiate: initiate as never,
    });
  };

  it("stores the external reference before returning the redirect", async () => {
    registerFakeGateway(async () => ({
      externalRef: "cs_test_9",
      redirectUrl: "https://pay.example/cs_test_9",
      metadata: { gateway: "fake" },
    }));

    const result = await paymentService.initiatePayment(
      "WALLET",
      transaction,
      60,
      context,
    );

    // Losing the reference means a payment we cannot reconcile against the
    // provider's ledger, so it is written immediately rather than on callback.
    expect(mockedTransactions.attachGatewayReference).toHaveBeenCalledWith(
      "txn_1",
      { externalRef: "cs_test_9", metadata: { gateway: "fake" } },
    );
    expect(result.redirectUrl).toBe("https://pay.example/cs_test_9");
  });

  it("lets a gateway failure propagate to the caller", async () => {
    registerFakeGateway(async () => {
      throw new Error("gateway unreachable");
    });

    // Swallowing this would hand the customer an order they can never pay for.
    await expect(
      paymentService.initiatePayment("WALLET", transaction, 60, context),
    ).rejects.toThrow("gateway unreachable");
  });
});
