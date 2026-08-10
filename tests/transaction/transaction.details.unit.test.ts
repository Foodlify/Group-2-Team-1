/**
 * Turning a gateway's metadata blob into typed columns.
 *
 * The blob is arbitrary provider JSON. Two things decide whether this is safe:
 * it must take only the keys we have decided mean something, and it must
 * report *only what this write knows* — because the caller merges the result
 * into an existing row, and a key it invents as `null` would erase a fact
 * learned earlier.
 */
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
    // The refund code writes `refundStatus` and `error`; the columns are named
    // for the general case.
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
    // A provider can put anything in there. Anything is not a column.
    expect(
      extractDetails({ gateway: "stripe", cardNumber: "4242424242424242" }),
    ).toEqual({ gateway: "stripe" });
  });

  it("ignores a value of the wrong type", () => {
    // `expiresAt` is a number in the checkout metadata; a stray non-string in
    // a string column is how a write fails at 3am instead of at review.
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

    // The caller merges this into an existing row. A `sessionId: null` here
    // would wipe the id recorded when the checkout was created.
    expect(fields).toEqual({ paymentIntentId: "pi_1" });
    expect(fields).not.toHaveProperty("sessionId");
    expect(fields).not.toHaveProperty("gateway");
  });

  it("returns null for a blob with nothing gateway-shaped in it", () => {
    // A cash payment. Writing an all-null row for it would claim a gateway was
    // involved in a transaction that never touched one.
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
    // These are the three blobs the card flow really writes, in order. Each
    // must yield only its own contribution so the merge accumulates.
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
    // The PaymentIntent appears only at the second stage — and nothing in the
    // first write claims it does not exist.
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
