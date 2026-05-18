-- AlterTable
ALTER TABLE "OrderStatus" ADD COLUMN     "history" JSONB NOT NULL DEFAULT '[]';
