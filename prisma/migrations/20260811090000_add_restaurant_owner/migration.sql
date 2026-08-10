-- The restaurant owner: the official ERD lists `Restaurant` among the user
-- module's tables, and the Order Management endpoints name Restaurants as an
-- actor ("Restaurants Order History", "Cancelled Orders by Customers or
-- Restaurants"). This column is the edge those two facts imply.

-- A new enum value. Safe to add inside the migration's transaction on
-- PostgreSQL 12+ precisely because nothing below writes it — an added label
-- cannot be used in the same transaction that created it.
ALTER TYPE "Role" ADD VALUE 'RESTAURANT';

-- Nullable, and no backfill: every existing restaurant is unowned, which is the
-- state the system has been in all along. Nothing changes behaviour on the day
-- this runs.
ALTER TABLE "Restaurant" ADD COLUMN "ownerId" TEXT;

CREATE INDEX "Restaurant_ownerId_idx" ON "Restaurant"("ownerId");

-- ON DELETE SET NULL, not CASCADE: deleting the account must not delete the
-- restaurant, its menus, or the orders that reference it. It becomes unowned.
ALTER TABLE "Restaurant"
  ADD CONSTRAINT "Restaurant_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
