-- CreateTable
CREATE TABLE "PreferredPaymentSetting" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreferredPaymentSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PreferredPaymentSetting_customerId_idx" ON "PreferredPaymentSetting"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "PreferredPaymentSetting_customerId_method_key" ON "PreferredPaymentSetting"("customerId", "method");

-- AddForeignKey
ALTER TABLE "PreferredPaymentSetting" ADD CONSTRAINT "PreferredPaymentSetting_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

