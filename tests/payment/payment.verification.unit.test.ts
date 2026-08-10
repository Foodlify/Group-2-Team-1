/**
 * Verifying that the gateway settled what we asked for.
 *
 * The signature check that runs before this proves the event is Stripe's. It
 * says nothing about the figure inside it. This function is the only thing
 * standing between "a valid event arrived" and "this order is paid in full",
 * so the case that matters most is the cheap one: an order for 100 settled by
 * a session for 1.
 */
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
    // Our ledger stores "EGP"; Stripe reports "egp". Comparing raw strings
    // would reject every single correct payment.
    expect(
      verifySettlement(owed("10.00", "EGP"), {
        amountTotal: 1000,
        currency: "egp",
      }),
    ).toBeNull();
  });

  it("does not depend on which casing the gateway happens to use", () => {
    // Stripe documents lower case today. Both sides are normalised anyway, so
    // the comparison is between currency identifiers rather than between two
    // strings that happen to agree on a provider's formatting convention.
    expect(
      verifySettlement(owed("10.00", "EGP"), {
        amountTotal: 1000,
        currency: "EGP",
      }),
    ).toBeNull();
  });

  it("scales the expected amount in Decimal, not as a float", () => {
    // `19.99 * 100` is 1998.9999999999998 in JavaScript. A float comparison
    // here rejects a perfectly good payment, and only for certain prices —
    // which is how it survives every test written against round numbers.
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
    // Not a windfall to be quietly accepted: it means the order and the
    // session disagree, and the reason for that is worth knowing before the
    // food is sent out.
    expect(
      verifySettlement(owed("10.00"), { amountTotal: 5000, currency: "egp" }),
    ).toMatchObject({ reason: "amount_mismatch" });
  });

  it("catches a currency swap", () => {
    // 2445 of a weaker unit is not 2445 piastres. The amounts would match.
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
    // Across two currencies the minor units are not comparable, and
    // "2445 ≠ 2445" is a baffling thing to hand whoever investigates.
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
    // The boundary. A check written with a tolerance, or with `>=`, lets this
    // through — and whoever is skimming will find the edge of it.
    expect(
      verifySettlement(owed("24.45"), { amountTotal: 2444, currency: "egp" }),
    ).toMatchObject({ reason: "amount_mismatch" });
  });

  it("reports both sides so a human can act on it", () => {
    const discrepancy = verifySettlement(owed("24.45"), {
      amountTotal: 2444,
      currency: "egp",
    });

    // The row is left unsettled; the pair of numbers is the entire basis for
    // deciding what to do about it.
    expect(discrepancy).toEqual({
      reason: "amount_mismatch",
      expected: "2445",
      received: "2444",
    });
  });
});
