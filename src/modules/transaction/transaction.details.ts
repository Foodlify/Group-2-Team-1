/**
 * Turning a gateway's metadata blob into typed columns.
 *
 * Every payment path already writes these facts into `Transaction.metadata`.
 * Extracting them here — in one place, at the repository layer — means no call
 * site has to remember to populate `TransactionDetails`, for the same reason
 * auditing lives there: a table whose completeness depends on every future
 * caller doing the right thing is a table you cannot trust.
 *
 * Only known keys are read, and only when they are strings. A provider is free
 * to put anything in that blob; this is the list of things we have decided
 * mean something.
 */

export interface TransactionDetailFields {
  gateway?: string;
  stage?: string;
  sessionId?: string;
  paymentIntentId?: string;
  refundId?: string;
  gatewayStatus?: string;
  failureReason?: string;
}

const str = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

/**
 * The typed facts in a metadata blob, or null when it carries none.
 *
 * Null matters: a cash payment's metadata has nothing gateway-shaped in it, and
 * writing an all-null details row for it would claim there was a gateway
 * involved.
 */
export const extractDetails = (
  metadata: unknown,
): TransactionDetailFields | null => {
  if (typeof metadata !== "object" || metadata === null) return null;
  const source = metadata as Record<string, unknown>;

  const fields: TransactionDetailFields = {
    gateway: str(source.gateway),
    stage: str(source.stage),
    sessionId: str(source.sessionId),
    paymentIntentId: str(source.paymentIntentId),
    refundId: str(source.refundId),
    // The refund path writes `refundStatus`; the name here is the general one.
    gatewayStatus: str(source.gatewayStatus) ?? str(source.refundStatus),
    // Refund failures are recorded under `error`.
    failureReason: str(source.failureReason) ?? str(source.error),
  };

  // Strip the absent ones. What is left is exactly what this write knows, and
  // the caller relies on that: an absent key must leave the stored column
  // alone rather than clear it.
  const present = Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  ) as TransactionDetailFields;

  return Object.keys(present).length > 0 ? present : null;
};
