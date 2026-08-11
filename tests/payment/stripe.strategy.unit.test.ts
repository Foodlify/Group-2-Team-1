import { beforeEach, describe, expect, it, vi } from "vitest";

const createSession = vi.fn();

vi.mock("../../src/modules/payment/stripe.client", () => ({
  getStripe: () => ({ checkout: { sessions: { create: createSession } } }),
  isStripeConfigured: () => true,
}));

vi.mock("../../src/config/env", () => ({
  default: {
    STRIPE_SUCCESS_URL: "https://shop.example/paid",
    STRIPE_CANCEL_URL: "https://shop.example/cancelled",
  },
}));

import {
  StripeCardStrategy,
  stripeCardStrategy,
} from "../../src/modules/payment/stripe.strategy";

const transaction = { id: "txn_abc" } as never;
const context = {
  orderId: "order_1",
  customerId: "cust_1",
  currency: "EGP",
};

beforeEach(() => {
  vi.clearAllMocks();
  createSession.mockResolvedValue({
    id: "cs_test_123",
    url: "https://checkout.stripe.com/c/pay/cs_test_123",
    expires_at: 1_800_000_000,
  });
});

describe("money is converted to minor units exactly", () => {
  it.each([
    [45.5, 4550],
    [19.99, 1999],
    [8.15, 815],
    [0.1, 10],
    [1.05, 105],
    [30, 3000],
  ])("charges %s EGP as %i piastres", (amount, expected) => {
    expect(StripeCardStrategy.toMinorUnits(amount)).toBe(expected);
  });

  it("proves the naive float version would be wrong", () => {
    expect(Math.trunc(19.99 * 100)).toBe(1998);
    expect(StripeCardStrategy.toMinorUnits(19.99)).toBe(1999);
  });

  it("refuses an amount it cannot represent rather than rounding it", () => {
    expect(() => StripeCardStrategy.toMinorUnits(10.005)).toThrow(
      /cannot be represented/,
    );
  });
});

describe("pay() stays local", () => {
  it("records the payment as pending without calling Stripe", async () => {
    const result = await stripeCardStrategy.pay(100, context);

    expect(createSession).not.toHaveBeenCalled();
    expect(result.status).toBe("PENDING");
  });

  it("never reports success on its own", async () => {
    const result = await stripeCardStrategy.pay(100, context);

    expect(result.status).not.toBe("SUCCESS");
  });
});

describe("initiate() creates the checkout session", () => {
  it("sends the amount in minor units with the lowercased currency", async () => {
    await stripeCardStrategy.initiate(transaction, 45.5, context);

    const [params] = createSession.mock.calls[0]!;
    expect(params.line_items[0].price_data.unit_amount).toBe(4550);

    expect(params.line_items[0].price_data.currency).toBe("egp");
  });

  it("attaches the ids the webhook needs to find its way back", async () => {
    await stripeCardStrategy.initiate(transaction, 45.5, context);

    const [params] = createSession.mock.calls[0]!;

    expect(params.metadata).toEqual({
      orderId: "order_1",
      transactionId: "txn_abc",
    });
  });

  it("keys the request on the transaction so a retry cannot double-charge", async () => {
    await stripeCardStrategy.initiate(transaction, 45.5, context);

    const [, options] = createSession.mock.calls[0]!;
    expect(options.idempotencyKey).toBe("order-payment-txn_abc");
  });

  it("returns the session id and the URL the customer must visit", async () => {
    const result = await stripeCardStrategy.initiate(
      transaction,
      45.5,
      context,
    );

    expect(result.externalRef).toBe("cs_test_123");
    expect(result.redirectUrl).toBe(
      "https://checkout.stripe.com/c/pay/cs_test_123",
    );
  });

  it("normalises a null session URL instead of handing back null", async () => {
    createSession.mockResolvedValue({ id: "cs_1", url: null, expires_at: 1 });

    const result = await stripeCardStrategy.initiate(transaction, 10, context);

    expect(result.redirectUrl).toBeUndefined();
  });

  it("sends the customer to the configured return URLs", async () => {
    await stripeCardStrategy.initiate(transaction, 45.5, context);

    const [params] = createSession.mock.calls[0]!;
    expect(params.success_url).toBe("https://shop.example/paid");
    expect(params.cancel_url).toBe("https://shop.example/cancelled");
    expect(params.mode).toBe("payment");
  });
});
