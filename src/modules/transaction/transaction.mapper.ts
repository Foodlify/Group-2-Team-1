import type { TransactionModel } from "../../generated/prisma/models";
import type { TransactionResponse } from "../payment/payment.validation";
import type { TransactionWithDetails } from "./transaction.service";
import type { AdminTransactionResponse } from "./transaction.validation";

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
