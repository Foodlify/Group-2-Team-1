-- The official ERD's `paymentIntegrationType` and
-- `paymentIntegrationConfiguration`.
--
-- Seeded here rather than by application code, so a fresh database and a
-- migrated one end up identical and neither depends on someone remembering to
-- run a script. Both rows default to enabled, which is exactly how the system
-- behaved before this table existed — the migration changes no behaviour on
-- the day it runs.
--
-- No secret is stored, now or ever: the configuration records the NAME of the
-- environment variable holding each key. A database is dumped, backed up and
-- replicated, and a key in a table is a key in all of those places.

-- CreateTable
CREATE TABLE "PaymentIntegrationType" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentIntegrationType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentIntegrationConfiguration" (
    "id" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "successUrl" TEXT,
    "cancelUrl" TEXT,
    "isTestMode" BOOLEAN NOT NULL DEFAULT true,
    "secretKeyEnvVar" TEXT,
    "webhookSecretEnvVar" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentIntegrationConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentIntegrationType_code_key" ON "PaymentIntegrationType"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentIntegrationConfiguration_typeId_key" ON "PaymentIntegrationConfiguration"("typeId");

-- AddForeignKey
ALTER TABLE "PaymentIntegrationConfiguration" ADD CONSTRAINT "PaymentIntegrationConfiguration_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "PaymentIntegrationType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed: the two integrations this codebase actually has a strategy for.
INSERT INTO "PaymentIntegrationType" ("id", "code", "displayName", "paymentMethod", "isEnabled", "updatedAt")
VALUES
  ('pit_seed_cash',   'cash',   'Cash on delivery', 'CASH',        true, CURRENT_TIMESTAMP),
  ('pit_seed_stripe', 'stripe', 'Stripe Checkout',  'CREDIT_CARD', true, CURRENT_TIMESTAMP);

INSERT INTO "PaymentIntegrationConfiguration" ("id", "typeId", "currency", "isTestMode", "secretKeyEnvVar", "webhookSecretEnvVar", "updatedAt")
VALUES
  ('pic_seed_cash',   'pit_seed_cash',   'EGP', false, NULL,                 NULL,                     CURRENT_TIMESTAMP),
  ('pic_seed_stripe', 'pit_seed_stripe', 'EGP', true,  'STRIPE_SECRET_KEY',  'STRIPE_WEBHOOK_SECRET',  CURRENT_TIMESTAMP);
