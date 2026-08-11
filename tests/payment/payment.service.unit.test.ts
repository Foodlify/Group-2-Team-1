import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/modules/payment/integration.service", () => ({
  paymentIntegrationService: {
    assertMethodEnabled: vi.fn().mockResolvedValue(undefined),
  },
}));

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

    expect(mockedTransactions.attachGatewayReference).not.toHaveBeenCalled();
  });
});

describe("initiatePayment persists what the gateway returned", () => {
  const transaction = { id: "txn_1" } as never;

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

    await expect(
      paymentService.initiatePayment("WALLET", transaction, 60, context),
    ).rejects.toThrow("gateway unreachable");
  });
});
