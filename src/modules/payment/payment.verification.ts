import { Prisma } from "../../generated/prisma/client";

/**
 * Checking that what the gateway settled is what we actually asked for.
 *
 * A valid signature proves the event came from Stripe. It does not prove the
 * event settles *our* payment: it says money moved, not that the right amount
 * of the right currency moved against the right ledger row. Marking a
 * transaction SUCCESS on the strength of the signature alone accepts whatever
 * figure the event happens to carry — including one that is not the order
 * total.
 *
 * Kept as a pure function, separate from the webhook handler, because this is
 * the part worth being certain about and it should be testable without a
 * database, a transaction or a mocked Stripe.
 */

export type DiscrepancyReason = "amount_mismatch" | "currency_mismatch";

export interface SettlementDiscrepancy {
  reason: DiscrepancyReason;
  /** What our ledger says this payment should have been. */
  expected: string;
  /** What the gateway says it settled. */
  received: string;
}

/** Our side: the still-pending ledger row this event claims to settle. */
export interface ExpectedSettlement {
  amount: Prisma.Decimal | number | string;
  currency: string;
}

/** The gateway's side, as Stripe reports it on a Checkout Session. */
export interface ReportedSettlement {
  /** Stripe's `amount_total`, in the currency's minor unit. */
  amountTotal: number | null;
  currency: string | null;
}

/**
 * Null when the settlement matches what we expected; a description of the
 * disagreement otherwise.
 *
 * Currency is checked first on purpose: comparing minor units across two
 * different currencies is comparing nothing at all, and "1000 ≠ 1000" would be
 * a baffling thing to put in front of whoever has to investigate.
 */
export const verifySettlement = (
  expected: ExpectedSettlement,
  reported: ReportedSettlement,
): SettlementDiscrepancy | null => {
  const expectedCurrency = expected.currency.toLowerCase();
  // Stripe reports currency in lower case; our ledger stores "EGP".
  const reportedCurrency = reported.currency?.toLowerCase() ?? null;
  if (expectedCurrency !== reportedCurrency) {
    return {
      reason: "currency_mismatch",
      expected: expectedCurrency,
      received: reportedCurrency ?? "none",
    };
  }

  // Scaled as a Decimal, never as a float. `19.99 * 100` is
  // 1998.9999999999998 in JavaScript, so a float comparison would reject a
  // correct payment — the kind of bug that only appears on certain prices.
  const expectedMinor = new Prisma.Decimal(expected.amount).times(100);
  if (
    reported.amountTotal === null ||
    !expectedMinor.equals(reported.amountTotal)
  ) {
    return {
      reason: "amount_mismatch",
      expected: expectedMinor.toString(),
      received:
        reported.amountTotal === null ? "none" : String(reported.amountTotal),
    };
  }

  return null;
};
