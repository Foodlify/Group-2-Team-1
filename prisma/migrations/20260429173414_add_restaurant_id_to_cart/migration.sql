/*
  Warnings:

  - You are about to drop the column `userId` on the `Address` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `Cart` table. All the data in the column will be lost.
  - You are about to alter the column `price` on the `MenuItem` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(65,30)`.
  - You are about to drop the column `typeId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the `AuditingEvent` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Order` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `OrderItem` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `OrderStatus` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `OrderTracking` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PaymentIntegrationType` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PaymentTypeConfiguration` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PreferredPaymentSetting` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `RestaurantDetails` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Role` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Transaction` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TransactionDetails` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TransactionStatus` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `UserRole` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `UserType` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[customerId]` on the table `Cart` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `customerId` to the `Address` table without a default value. This is not possible if the table is not empty.
  - Added the required column `customerId` to the `Cart` table without a default value. This is not possible if the table is not empty.
  - Added the required column `restaurantId` to the `Cart` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name` to the `CartItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `price` to the `CartItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name` to the `Menu` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Address" DROP CONSTRAINT "Address_userId_fkey";

-- DropForeignKey
ALTER TABLE "Cart" DROP CONSTRAINT "Cart_userId_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_addressId_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_customerId_fkey";

-- DropForeignKey
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_menuItemId_fkey";

-- DropForeignKey
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_orderId_fkey";

-- DropForeignKey
ALTER TABLE "OrderStatus" DROP CONSTRAINT "OrderStatus_orderId_fkey";

-- DropForeignKey
ALTER TABLE "OrderTracking" DROP CONSTRAINT "OrderTracking_orderId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentTypeConfiguration" DROP CONSTRAINT "PaymentTypeConfiguration_paymentIntegrationTypeId_fkey";

-- DropForeignKey
ALTER TABLE "PreferredPaymentSetting" DROP CONSTRAINT "PreferredPaymentSetting_paymentTypeConfigId_fkey";

-- DropForeignKey
ALTER TABLE "PreferredPaymentSetting" DROP CONSTRAINT "PreferredPaymentSetting_userId_fkey";

-- DropForeignKey
ALTER TABLE "RestaurantDetails" DROP CONSTRAINT "RestaurantDetails_restaurantId_fkey";

-- DropForeignKey
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_orderId_fkey";

-- DropForeignKey
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_transactionStatusId_fkey";

-- DropForeignKey
ALTER TABLE "TransactionDetails" DROP CONSTRAINT "TransactionDetails_transactionId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_typeId_fkey";

-- DropForeignKey
ALTER TABLE "UserRole" DROP CONSTRAINT "UserRole_roleId_fkey";

-- DropForeignKey
ALTER TABLE "UserRole" DROP CONSTRAINT "UserRole_userId_fkey";

-- DropIndex
DROP INDEX "Address_userId_idx";

-- DropIndex
DROP INDEX "Cart_userId_key";

-- DropIndex
DROP INDEX "User_typeId_idx";

-- AlterTable
ALTER TABLE "Address" DROP COLUMN "userId",
ADD COLUMN     "customerId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Cart" DROP COLUMN "userId",
ADD COLUMN     "customerId" TEXT NOT NULL,
ADD COLUMN     "restaurantId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "CartItem" ADD COLUMN     "name" TEXT NOT NULL,
ADD COLUMN     "price" DECIMAL(65,30) NOT NULL;

-- AlterTable
ALTER TABLE "Menu" ADD COLUMN     "name" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "MenuItem" ALTER COLUMN "price" SET DATA TYPE DECIMAL(65,30);

-- AlterTable
ALTER TABLE "User" DROP COLUMN "typeId";

-- DropTable
DROP TABLE "AuditingEvent";

-- DropTable
DROP TABLE "Order";

-- DropTable
DROP TABLE "OrderItem";

-- DropTable
DROP TABLE "OrderStatus";

-- DropTable
DROP TABLE "OrderTracking";

-- DropTable
DROP TABLE "PaymentIntegrationType";

-- DropTable
DROP TABLE "PaymentTypeConfiguration";

-- DropTable
DROP TABLE "PreferredPaymentSetting";

-- DropTable
DROP TABLE "RestaurantDetails";

-- DropTable
DROP TABLE "Role";

-- DropTable
DROP TABLE "Transaction";

-- DropTable
DROP TABLE "TransactionDetails";

-- DropTable
DROP TABLE "TransactionStatus";

-- DropTable
DROP TABLE "UserRole";

-- DropTable
DROP TABLE "UserType";

-- CreateIndex
CREATE INDEX "Address_customerId_idx" ON "Address"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Cart_customerId_key" ON "Cart"("customerId");

-- CreateIndex
CREATE INDEX "Cart_restaurantId_idx" ON "Cart"("restaurantId");

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
