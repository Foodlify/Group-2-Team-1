-- The official ERD's `transactionDetails`: the gateway's own facts about a
-- transaction, as typed columns instead of keys in a JSON blob.
--
-- Purely additive. `Transaction.metadata` is left exactly as it is — this
-- table is what code reads, that blob stays as the raw record of what the
-- provider actually said. Existing transactions get no row: their facts are
-- still in the blob, and the read path falls back to it for precisely that
-- reason.

-- CreateTable
CREATE TABLE "TransactionDetails" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "gateway" TEXT,
    "stage" TEXT,
    "sessionId" TEXT,
    "paymentIntentId" TEXT,
    "refundId" TEXT,
    "gatewayStatus" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransactionDetails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TransactionDetails_transactionId_key" ON "TransactionDetails"("transactionId");

-- CreateIndex
-- "which of our rows belongs to this PaymentIntent" — the question asked when
-- reconciling against Stripe's own records.
CREATE INDEX "TransactionDetails_paymentIntentId_idx" ON "TransactionDetails"("paymentIntentId");

-- AddForeignKey
ALTER TABLE "TransactionDetails" ADD CONSTRAINT "TransactionDetails_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
