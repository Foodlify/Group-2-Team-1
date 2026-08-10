import type { TransactionModel } from "../../generated/prisma/models";
import type { TransactionResponse } from "../payment/payment.validation";

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
