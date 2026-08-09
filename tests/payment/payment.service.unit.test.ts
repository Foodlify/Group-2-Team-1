/**
 * Payment service — strategy routing and the two-phase split.
 *
 * The rule this file defends: the API must never advertise a payment method it
 * cannot process. `SUPPORTED_PAYMENT_METHODS` (what request validation accepts)
 * and the registered strategies (what actually runs) are derived from the same
 * condition, and a drift between them is a 500 in a customer's checkout.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/modules/transaction/transaction.service", () => ({
  transactionService: {
    createTransaction: vi.fn(),
    attachGatewayReference: vi.fn(),
  },
}));

import { paymentService } from "../../src/modules/payment/payment.service";
import { transactionService } from "../../src/modules/transaction/transaction.service";
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
  /**
   * Loads both modules fresh under a given Stripe configuration.
   *
   * They read `env` once at import time, so the branch under test has to be
   * chosen before the import — and the environment must be stubbed rather than
   * inherited, or this suite would pass or fail depending on whether the
   * developer running it happens to have Stripe keys in their own `.env`.
   */
  const loadWith = async (stripeConfigured: boolean) => {
    vi.stubEnv("STRIPE_SECRET_KEY", stripeConfigured ? "sk_test_unit" : "");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", stripeConfigured ? "whsec_unit" : "");
    vi.resetModules();
    const [{ paymentService: svc }, { SUPPORTED_PAYMENT_METHODS: methods }] =
      await Promise.all([
        import("../../src/modules/payment/payment.service"),
        import("../../src/modules/transaction/transaction.model"),
      ]);
    return { svc, methods };
  };

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  // The invariant, checked in BOTH configurations: whatever the environment
  // enables, request validation and execution must agree. A mismatch is a
  // method the API advertises with no strategy behind it — a 500 in the middle
  // of a customer's checkout — or a strategy nobody can reach.
  it.each([
    ["without Stripe", false],
    ["with Stripe configured", true],
  ])("accepts exactly the methods that have a strategy (%s)", async (_, on) => {
    const { svc, methods } = await loadWith(on as boolean);

    expect([...methods].sort()).toEqual(svc.supportedMethods().sort());
  });

  it("hides CREDIT_CARD when Stripe is not configured", async () => {
    const { svc, methods } = await loadWith(false);

    expect(methods).toEqual(["CASH"]);
    expect(svc.supportedMethods()).not.toContain("CREDIT_CARD");
  });

  it("offers CREDIT_CARD once Stripe is configured", async () => {
    const { svc, methods } = await loadWith(true);

    expect(methods).toContain("CREDIT_CARD");
    expect(svc.supportedMethods()).toContain("CREDIT_CARD");
  });

  it("always supports cash on delivery, in either configuration", async () => {
    // Cash needs no configuration, so no missing key can switch it off.
    expect((await loadWith(false)).svc.supportedMethods()).toContain("CASH");
    expect((await loadWith(true)).svc.supportedMethods()).toContain("CASH");
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
