-- AlterTable
ALTER TABLE "Cart" ADD COLUMN     "guestToken" TEXT,
ALTER COLUMN "customerId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Cart_guestToken_key" ON "Cart"("guestToken");

-- A cart is owned by exactly one identity: a customer OR a guest token.
-- Prisma can't express this, so the invariant is enforced by the database
-- itself rather than trusted to application code.
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_single_owner_check"
  CHECK (num_nonnulls("customerId", "guestToken") = 1);

