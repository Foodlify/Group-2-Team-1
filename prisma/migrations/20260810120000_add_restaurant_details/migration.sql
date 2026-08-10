-- The official ERD's `restaurantDetails`.
--
-- Purely additive, and deliberately optional: every existing restaurant keeps
-- working with no details row. The alternative — a NOT NULL phone and address
-- on `Restaurant` — would have needed a backfill, and there is nothing truthful
-- to backfill them with.
--
-- The unique index on `restaurantId` is what makes this one-to-one at the
-- database level rather than only in the Prisma schema.

-- CreateTable
CREATE TABLE "RestaurantDetails" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "description" TEXT,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantDetails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantDetails_restaurantId_key" ON "RestaurantDetails"("restaurantId");

-- AddForeignKey
ALTER TABLE "RestaurantDetails" ADD CONSTRAINT "RestaurantDetails_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
