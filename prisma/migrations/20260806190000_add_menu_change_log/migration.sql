-- CreateEnum
CREATE TYPE "MenuChangeEntity" AS ENUM ('MENU', 'MENU_ITEM');

-- CreateEnum
CREATE TYPE "MenuChangeAction" AS ENUM ('CREATED', 'UPDATED', 'DELETED');

-- CreateTable
CREATE TABLE "MenuChangeLog" (
    "id" TEXT NOT NULL,
    "menuId" TEXT NOT NULL,
    "entity" "MenuChangeEntity" NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" "MenuChangeAction" NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MenuChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MenuChangeLog_menuId_createdAt_idx" ON "MenuChangeLog"("menuId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "MenuChangeLog" ADD CONSTRAINT "MenuChangeLog_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "Menu"("id") ON DELETE CASCADE ON UPDATE CASCADE;

