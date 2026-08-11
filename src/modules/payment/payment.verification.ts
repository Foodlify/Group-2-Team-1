import { Prisma } from "../../generated/prisma/client";

export type DiscrepancyReason = "amount_mismatch" | "currency_mismatch";

export interface SettlementDiscrepancy {
  reason: DiscrepancyReason;

  expected: string;

  received: string;
}

export interface ExpectedSettlement {
  amount: Prisma.Decimal | number | string;
  currency: string;
}

export interface ReportedSettlement {
  amountTotal: number | null;
  currency: string | null;
}

export const verifySettlement = (
  expected: ExpectedSettlement,
  reported: ReportedSettlement,
): SettlementDiscrepancy | null => {
  const expectedCurrency = expected.currency.toLowerCase();

  const reportedCurrency = reported.currency?.toLowerCase() ?? null;
  if (expectedCurrency !== reportedCurrency) {
    return {
      reason: "currency_mismatch",
      expected: expectedCurrency,
      received: reportedCurrency ?? "none",
    };
  }

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
