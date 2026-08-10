-- Social Media Authentication (Google), from the official scope map.

-- The Google `sub` claim. Nullable — most accounts are password accounts —
-- and unique, so one Google identity cannot be linked to two of ours.
ALTER TABLE "User" ADD COLUMN "googleId" TEXT;
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- An account created through Google has no password. Widening the column is
-- safe for every existing row: they all have one, and nothing about them
-- changes.
ALTER TABLE "User" ALTER COLUMN "password" DROP NOT NULL;

-- Google returns no phone number. Rather than invent one — it would end up on
-- a delivery record — the column becomes nullable and the customer adds it
-- through PATCH /customers/me. Password registration still requires it.
--
-- The unique index is unaffected: PostgreSQL treats NULLs as distinct, so any
-- number of customers may have no phone while no two can share one.
ALTER TABLE "Customer" ALTER COLUMN "phone" DROP NOT NULL;
