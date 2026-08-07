-- Soft delete + auditing columns for the catalog.
--
-- `isDeleted` defaults to false, so every existing row stays visible: this
-- migration changes nothing about what the API returns until code starts
-- setting the flag. `createdBy` / `updatedBy` are nullable on purpose — rows
-- that predate auditing have no actor to attribute, and inventing one would be
-- worse than admitting we don't know.

-- AlterEnum
-- Restores join the menu history alongside creates, updates and deletes.
ALTER TYPE "MenuChangeAction" ADD VALUE 'RESTORED';

-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "updatedBy" TEXT;

-- AlterTable
ALTER TABLE "Menu" ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "updatedBy" TEXT;

-- AlterTable
ALTER TABLE "MenuChangeLog" ADD COLUMN     "changedBy" TEXT;

-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "updatedBy" TEXT;
