import type { Prisma } from "../../generated/prisma/client";

/**
 * Report granularity. The official requirement asks for daily and monthly
 * transaction reports, so these are the only two buckets.
 */
export const REPORT_GRANULARITIES = ["day", "month"] as const;
export type ReportGranularity = (typeof REPORT_GRANULARITIES)[number];

/**
 * Maps our granularity onto the exact `date_trunc` unit. The value reaching
 * SQL comes from this table, never from the request — even though the request
 * is already validated against the same list, an enum value is not a safe
 * source for a SQL identifier and should not be treated as one.
 */
export const DATE_TRUNC_UNIT: Record<ReportGranularity, string> = {
  day: "day",
  month: "month",
};

/**
 * What the official `Daily Orders not Delivered Count` counts.
 *
 * The obvious reading — "status is not DELIVERED" — would include cancelled
 * orders, and the scope map lists `Daily Cancelled Orders` as its own bullet
 * immediately next to this one. Two adjacent counters that overlap would make
 * the pair useless: you could not add them, and neither would answer a
 * question. Read as a partition instead, this one is the orders still owed to
 * a customer — placed, not yet delivered, not called off.
 *
 * So both terminal statuses are excluded, and a restaurant reading it gets the
 * number it actually wants: outstanding work.
 */
export const NOT_DELIVERED_STATUSES_EXCLUDED = [
  "DELIVERED",
  "CANCELLED",
] as const;

/** One row of the raw grouped-transaction query, before any money maths. */
export interface TransactionBucketRow {
  bucket: Date;
  type: string;
  count: number;
  total: Prisma.Decimal | null;
}

/** Money totals for a set of transactions, kept exact until the boundary. */
export interface MoneyTotals {
  payments: Prisma.Decimal;
  refunds: Prisma.Decimal;
  net: Prisma.Decimal;
}
