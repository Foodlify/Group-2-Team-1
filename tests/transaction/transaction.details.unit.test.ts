import { describe, expect, it } from "vitest";
import { extractDetails } from "../../src/modules/transaction/transaction.details";

describe("what it takes from the blob", () => {
  it("reads the gateway facts we care about", () => {
    expect(
      extractDetails({
        gateway: "stripe",
        stage: "paid",
        sessionId: "cs_1",
        paymentIntentId: "pi_1",
      }),
    ).toEqual({
      gateway: "stripe",
      stage: "paid",
      sessionId: "cs_1",
      paymentIntentId: "pi_1",
    });
  });

  it("maps the refund path's own key names", () => {
    expect(
      extractDetails({
        gateway: "stripe",
        refundId: "re_1",
        refundStatus: "succeeded",
        error: "card network unavailable",
      }),
    ).toEqual({
      gateway: "stripe",
      refundId: "re_1",
      gatewayStatus: "succeeded",
      failureReason: "card network unavailable",
    });
  });

  it("ignores keys it was never told about", () => {
    expect(
      extractDetails({ gateway: "stripe", cardNumber: "4242424242424242" }),
    ).toEqual({ gateway: "stripe" });
  });

  it("ignores a value of the wrong type", () => {
    expect(extractDetails({ gateway: "stripe", sessionId: 12345 })).toEqual({
      gateway: "stripe",
    });
  });

  it("ignores an empty string", () => {
    expect(extractDetails({ gateway: "stripe", refundId: "" })).toEqual({
      gateway: "stripe",
    });
  });
});

describe("what it leaves out", () => {
  it("omits absent keys entirely rather than nulling them", () => {
    const fields = extractDetails({ paymentIntentId: "pi_1" });

    expect(fields).toEqual({ paymentIntentId: "pi_1" });
    expect(fields).not.toHaveProperty("sessionId");
    expect(fields).not.toHaveProperty("gateway");
  });

  it("returns null for a blob with nothing gateway-shaped in it", () => {
    expect(extractDetails({ note: "collected on delivery" })).toBeNull();
  });

  it("returns null for no metadata at all", () => {
    expect(extractDetails(null)).toBeNull();
    expect(extractDetails(undefined)).toBeNull();
  });

  it("returns null for something that is not an object", () => {
    expect(extractDetails("stripe")).toBeNull();
    expect(extractDetails(42)).toBeNull();
  });
});

describe("the successive writes of one payment", () => {
  it("keeps each stage's own facts separate", () => {
    const created = extractDetails({
      gateway: "stripe",
      stage: "checkout_created",
      sessionId: "cs_1",
      expiresAt: 1786300000,
    });
    const paid = extractDetails({
      gateway: "stripe",
      stage: "paid",
      sessionId: "cs_1",
      paymentIntentId: "pi_1",
    });

    expect(created).toEqual({
      gateway: "stripe",
      stage: "checkout_created",
      sessionId: "cs_1",
    });

    expect(created).not.toHaveProperty("paymentIntentId");
    expect(paid).toMatchObject({ paymentIntentId: "pi_1", stage: "paid" });
  });

  it("carries a verification failure through", () => {
    expect(
      extractDetails({
        gateway: "stripe",
        stage: "verification_failed",
        sessionId: "cs_1",
        reason: "amount_mismatch",
        expected: "2445",
        received: "1",
      }),
    ).toEqual({
      gateway: "stripe",
      stage: "verification_failed",
      sessionId: "cs_1",
    });
  });
});
