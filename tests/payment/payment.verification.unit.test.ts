import { describe, expect, it } from "vitest";
import { Prisma } from "../../src/generated/prisma/client";
import { verifySettlement } from "../../src/modules/payment/payment.verification";

const owed = (amount: string, currency = "EGP") => ({
  amount: new Prisma.Decimal(amount),
  currency,
});

describe("a settlement that matches", () => {
  it("passes", () => {
    expect(
      verifySettlement(owed("24.45"), { amountTotal: 2445, currency: "egp" }),
    ).toBeNull();
  });

  it("accepts our upper-case ledger value against Stripe's lower-case one", () => {
    expect(
      verifySettlement(owed("10.00", "EGP"), {
        amountTotal: 1000,
        currency: "egp",
      }),
    ).toBeNull();
  });

  it("does not depend on which casing the gateway happens to use", () => {
    expect(
      verifySettlement(owed("10.00", "EGP"), {
        amountTotal: 1000,
        currency: "EGP",
      }),
    ).toBeNull();
  });

  it("scales the expected amount in Decimal, not as a float", () => {
    expect(
      verifySettlement(owed("19.99"), { amountTotal: 1999, currency: "egp" }),
    ).toBeNull();
  });

  it("passes a whole-number amount stored with decimals", () => {
    expect(
      verifySettlement(owed("100.00"), { amountTotal: 10000, currency: "egp" }),
    ).toBeNull();
  });
});

describe("a settlement that does not", () => {
  it("catches an order for 100 paid with 1", () => {
    const discrepancy = verifySettlement(owed("100.00"), {
      amountTotal: 100,
      currency: "egp",
    });

    expect(discrepancy).toEqual({
      reason: "amount_mismatch",
      expected: "10000",
      received: "100",
    });
  });

  it("catches an overpayment too", () => {
    expect(
      verifySettlement(owed("10.00"), { amountTotal: 5000, currency: "egp" }),
    ).toMatchObject({ reason: "amount_mismatch" });
  });

  it("catches a currency swap", () => {
    expect(
      verifySettlement(owed("24.45", "EGP"), {
        amountTotal: 2445,
        currency: "usd",
      }),
    ).toEqual({
      reason: "currency_mismatch",
      expected: "egp",
      received: "usd",
    });
  });

  it("reports the currency before the amount", () => {
    expect(
      verifySettlement(owed("24.45", "EGP"), {
        amountTotal: 999,
        currency: "usd",
      }),
    ).toMatchObject({ reason: "currency_mismatch" });
  });

  it("treats a missing amount as a mismatch, never as a pass", () => {
    expect(
      verifySettlement(owed("24.45"), { amountTotal: null, currency: "egp" }),
    ).toEqual({
      reason: "amount_mismatch",
      expected: "2445",
      received: "none",
    });
  });

  it("treats a missing currency as a mismatch", () => {
    expect(
      verifySettlement(owed("24.45"), { amountTotal: 2445, currency: null }),
    ).toEqual({
      reason: "currency_mismatch",
      expected: "egp",
      received: "none",
    });
  });

  it("catches a one-piastre shortfall", () => {
    expect(
      verifySettlement(owed("24.45"), { amountTotal: 2444, currency: "egp" }),
    ).toMatchObject({ reason: "amount_mismatch" });
  });

  it("reports both sides so a human can act on it", () => {
    const discrepancy = verifySettlement(owed("24.45"), {
      amountTotal: 2444,
      currency: "egp",
    });

    expect(discrepancy).toEqual({
      reason: "amount_mismatch",
      expected: "2445",
      received: "2444",
    });
  });
});
