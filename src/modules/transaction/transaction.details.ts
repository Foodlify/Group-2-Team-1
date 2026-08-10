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

    gatewayStatus: str(source.gatewayStatus) ?? str(source.refundStatus),

    failureReason: str(source.failureReason) ?? str(source.error),
  };

  const present = Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  ) as TransactionDetailFields;

  return Object.keys(present).length > 0 ? present : null;
};
