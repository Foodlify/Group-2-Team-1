-- CreateTable
CREATE TABLE "RestaurantRate" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantRate_orderId_key" ON "RestaurantRate"("orderId");

-- CreateIndex
CREATE INDEX "RestaurantRate_restaurantId_idx" ON "RestaurantRate"("restaurantId");

-- CreateIndex
CREATE INDEX "RestaurantRate_customerId_idx" ON "RestaurantRate"("customerId");

-- AddForeignKey
ALTER TABLE "RestaurantRate" ADD CONSTRAINT "RestaurantRate_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantRate" ADD CONSTRAINT "RestaurantRate_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantRate" ADD CONSTRAINT "RestaurantRate_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

