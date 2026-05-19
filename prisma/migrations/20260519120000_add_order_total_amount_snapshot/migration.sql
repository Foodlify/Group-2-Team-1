-- Add totalAmount snapshot column to Order. Backfill from OrderItems before
-- enforcing NOT NULL so existing rows match the new invariant.

ALTER TABLE "Order" ADD COLUMN "totalAmount" DECIMAL(65,30);

UPDATE "Order" o
SET "totalAmount" = COALESCE(
  (SELECT SUM(oi.price * oi.quantity) FROM "OrderItems" oi WHERE oi."orderId" = o.id),
  0
);

ALTER TABLE "Order" ALTER COLUMN "totalAmount" SET NOT NULL;
