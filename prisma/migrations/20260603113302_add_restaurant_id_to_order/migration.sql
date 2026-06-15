/*
  Manually edited: add nullable first, backfill, then NOT NULL
*/
-- Add column as nullable first
ALTER TABLE "Order" ADD COLUMN     "restaurantId" TEXT;

-- Backfill existing orders with the first restaurant's ID
UPDATE "Order" SET "restaurantId" = (SELECT id FROM "Restaurant" LIMIT 1);

-- Now enforce NOT NULL
ALTER TABLE "Order" ALTER COLUMN "restaurantId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
