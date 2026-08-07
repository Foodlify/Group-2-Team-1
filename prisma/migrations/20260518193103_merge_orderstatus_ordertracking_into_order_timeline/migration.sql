/*
  Warnings:

  - You are about to drop the `OrderStatus` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `orderTracking` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "OrderStatus" DROP CONSTRAINT "OrderStatus_orderId_fkey";

-- DropForeignKey
ALTER TABLE "orderTracking" DROP CONSTRAINT "orderTracking_orderId_fkey";

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "timeline" JSONB NOT NULL DEFAULT '[]';

-- DropTable
DROP TABLE "OrderStatus";

-- DropTable
DROP TABLE "orderTracking";

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");
