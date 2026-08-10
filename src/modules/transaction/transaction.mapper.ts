import type { TransactionModel } from "../../generated/prisma/models";
import type { TransactionResponse } from "../payment/payment.validation";
import type { TransactionWithDetails } from "./transaction.service";
import type { AdminTransactionResponse } from "./transaction.validation";

/**
 * Ledger row → API shape. `error` is lifted out of the metadata blob because
 * "why is this refund still owed" is the whole reason an admin opens the
 * outstanding list, and making them dig through JSON for it helps nobody.
 *
 * Lives in the transaction module rather than in payment.service so the
 * listing endpoints can use it without importing the payment service — that
 * import would be a cycle, since payment.service already depends on
 * transaction.service.
 */
/**
 * The admin shape: the ledger row plus the gateway's own facts.
 *
 * Separate from `toTransactionResponse` rather than an optional field on it,
 * so the customer listing cannot grow these by accident. Null details is a
 * real answer — a cash payment has no gateway, and neither does a transaction
 * settled before `TransactionDetails` existed.
 */
export const toAdminTransactionResponse = (
  t: TransactionWithDetails,
): AdminTransactionResponse => ({
  ...toTransactionResponse(t),
  details: t.details
    ? {
        gateway: t.details.gateway,
        stage: t.details.stage,
        sessionId: t.details.sessionId,
        paymentIntentId: t.details.paymentIntentId,
        refundId: t.details.refundId,
        gatewayStatus: t.details.gatewayStatus,
        failureReason: t.details.failureReason,
      }
    : null,
});

export const toTransactionResponse = (
  t: TransactionModel,
): TransactionResponse => {
  const metadata = t.metadata as { error?: unknown } | null;
  return {
    id: t.id,
    type: t.type,
    status: t.status,
    amount: Number(t.amount),
    currency: t.currency,
    paymentMethod: t.paymentMethod,
    internalTxNumber: t.internalTxNumber,
    externalRef: t.externalRef,
    orderId: t.orderId,
    error: typeof metadata?.error === "string" ? metadata.error : null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
};
