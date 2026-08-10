import type { Prisma } from "../../generated/prisma/client";
import type { TransactionModel } from "../../generated/prisma/models";
import type { TransactionStatus } from "./transaction.model";

/**
 * What the audit trail records about a transaction write.
 *
 * Every payload here is assembled field by field. The tempting version — spread
 * the write's `data` and be done — is how a gateway's `metadata` ends up in an
 * append-only table that nothing ever prunes, and that JSON is arbitrary
 * provider content we do not control the shape of. What the audit needs is who
 * did what to which row; the provider's blob is already on the transaction
 * itself for anyone who needs it.
 *
 * Amounts are stringified. `Prisma.Decimal` in a JSON column would be stored as
 * whatever `JSON.stringify` makes of it, and the one thing a financial record
 * must never do is round.
 */
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

/**
 * A status transition, as the pair that makes it meaningful.
 *
 * "to: SUCCESS" alone cannot tell an auditor whether money moved or whether a
 * webhook was redelivered onto a row that had already settled. The `from` is
 * the whole point.
 *
 * `from` is nullable only to avoid a non-null assertion at the one call site —
 * the row is read under a lock immediately before the update, so a null there
 * would mean the row vanished, and the update would have thrown first. If it
 * ever did appear, "previous state unknown" is the honest thing for an audit
 * entry to say.
 */
export const auditStatusChange = (
  from: TransactionStatus | null,
  to: TransactionStatus,
): Prisma.InputJsonValue => ({ status: { from, to } });

/**
 * The gateway's own identifiers landing on a row.
 *
 * `metadataReplaced` is a flag rather than the metadata: recording that the
 * provider blob changed is the auditable fact, and copying the blob in would
 * duplicate unvetted third-party content into permanent storage.
 */
export const auditGatewayReference = (
  from: string | null,
  data: { externalRef?: string; metadata?: unknown },
): Prisma.InputJsonValue => ({
  ...(data.externalRef !== undefined
    ? { externalRef: { from, to: data.externalRef } }
    : {}),
  ...(data.metadata !== undefined ? { metadataReplaced: true } : {}),
});
