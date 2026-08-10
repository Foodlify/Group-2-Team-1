-- Web Push subscriptions — the delivery target for the official
-- `Notify Customer With Order Status` → `Push Notification`.
--
-- No provider account is involved: `endpoint` is a URL on the browser vendor's
-- own push service, and the two keys belong to the recipient browser. Our
-- VAPID signing key stays in the environment and is never stored here.

CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- The endpoint IS the identity of a subscription: a browser that re-subscribes
-- hands back the one it already has, and a duplicate row would mean every
-- notification arriving twice.
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

CREATE INDEX "PushSubscription_customerId_idx" ON "PushSubscription"("customerId");

-- Cascade: a deleted customer's browsers must stop being pushed to.
ALTER TABLE "PushSubscription"
  ADD CONSTRAINT "PushSubscription_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
