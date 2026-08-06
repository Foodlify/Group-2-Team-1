-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN     "stock" INTEGER;

-- Stock can be absent (untracked) but never negative: the conditional UPDATE
-- in checkout is the first line of defence, this is the last one.
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_stock_non_negative_check"
  CHECK ("stock" IS NULL OR "stock" >= 0);

