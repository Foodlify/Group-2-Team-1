import type { Prisma } from "../../generated/prisma/client";

export const REPORT_GRANULARITIES = ["day", "month"] as const;
export type ReportGranularity = (typeof REPORT_GRANULARITIES)[number];

export const DATE_TRUNC_UNIT: Record<ReportGranularity, string> = {
  day: "day",
  month: "month",
};

export const NOT_DELIVERED_STATUSES_EXCLUDED = [
  "DELIVERED",
  "CANCELLED",
] as const;

export interface TransactionBucketRow {
  bucket: Date;
  type: string;
  count: number;
  total: Prisma.Decimal | null;
}

export interface MoneyTotals {
  payments: Prisma.Decimal;
  refunds: Prisma.Decimal;
  net: Prisma.Decimal;
}
