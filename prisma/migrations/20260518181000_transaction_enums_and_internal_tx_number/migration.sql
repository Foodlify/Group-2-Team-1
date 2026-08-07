-- Catch-up migration: brings Transaction model to enum-based types and adds
-- internalTxNumber. This change already exists in the local development DB —
-- this file documents it in the migration history so future environments stay
-- in sync.

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('ORDER_PAYMENT', 'REFUND', 'PARTIAL_REFUND');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CREDIT_CARD', 'PAYPAL', 'WALLET');

-- AlterTable: convert text columns to enums (drop + recreate is acceptable
-- here because the table is empty in environments running this migration
-- fresh; the local dev DB already has the new shape and uses --resolve).
ALTER TABLE "Transaction" DROP COLUMN "type";
ALTER TABLE "Transaction" ADD COLUMN "type" "TransactionType" NOT NULL;

ALTER TABLE "Transaction" DROP COLUMN "status";
ALTER TABLE "Transaction" ADD COLUMN "status" "TransactionStatus" NOT NULL;

ALTER TABLE "Transaction" DROP COLUMN "paymentMethod";
ALTER TABLE "Transaction" ADD COLUMN "paymentMethod" "PaymentMethod" NOT NULL;

-- AlterTable: add internalTxNumber as a required unique reference
ALTER TABLE "Transaction" ADD COLUMN "internalTxNumber" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_internalTxNumber_key" ON "Transaction"("internalTxNumber");
