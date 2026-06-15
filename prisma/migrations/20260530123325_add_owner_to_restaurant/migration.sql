/*
  Manually edited: added ownerId + password as nullable first,
  backfilled existing rows, then set NOT NULL.
*/

-- 1. Add ownerId as nullable (table has 1 existing restaurant)
ALTER TABLE "Restaurant" ADD COLUMN     "ownerId" TEXT;

-- 2. Backfill — link the existing restaurant to the existing test user
UPDATE "Restaurant" SET "ownerId" = (SELECT id FROM "User" LIMIT 1);

-- 3. Now enforce NOT NULL
ALTER TABLE "Restaurant" ALTER COLUMN "ownerId" SET NOT NULL;

-- 4. Add password as nullable (table has 1 existing user without a password)
ALTER TABLE "User" ADD COLUMN     "password" TEXT;

-- 5. Backfill — set a placeholder hashed password for the existing user
UPDATE "User" SET "password" = '$2b$10$placeholder_for_existing_user_fix_me';

-- 6. Now enforce NOT NULL
ALTER TABLE "User" ALTER COLUMN "password" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Restaurant_ownerId_idx" ON "Restaurant"("ownerId");

-- AddForeignKey
ALTER TABLE "Restaurant" ADD CONSTRAINT "Restaurant_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
