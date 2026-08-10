import type { Prisma } from "../../generated/prisma/client";
import type { TransactionModel } from "../../generated/prisma/models";
import type { TransactionStatus } from "./transaction.model";

export const auditCreated = (
  transaction: TransactionModel,
): Prisma.InputJsonValue => ({
  type: transaction.type,
  status: transaction.status,
  paymentMethod: transaction.paymentMethod,
  amount: String(transaction.amount),
  currency: transaction.currency,
  internalTxNumber: transaction.internalTxNumber,
  externalRef: transaction.externalRef,
  orderId: transaction.orderId,
});

export const auditStatusChange = (
  from: TransactionStatus | null,
  to: TransactionStatus,
): Prisma.InputJsonValue => ({ status: { from, to } });

export const auditGatewayReference = (
  from: string | null,
  data: { externalRef?: string; metadata?: unknown },
): Prisma.InputJsonValue => ({
  ...(data.externalRef !== undefined
    ? { externalRef: { from, to: data.externalRef } }
    : {}),
  ...(data.metadata !== undefined ? { metadataReplaced: true } : {}),
});
