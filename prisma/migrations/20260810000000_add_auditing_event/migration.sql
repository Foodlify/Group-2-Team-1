-- The official ERD's generic `auditingEvent`, tied to transactions.
--
-- Purely additive: a new table and a new enum, no change to any existing row.
-- The trail starts empty and starts filling from the first transaction write
-- after this deploys — entries cannot be backfilled, because the "who" and
-- "from where" they record were never captured before now, and inventing them
-- would be worse than an honest gap.
--
-- No foreign keys on `entityId` or `actorId` on purpose: an audit entry has to
-- outlive both the row it describes and the account that wrote it, and a
-- cascade would erase the trail at exactly the moment it matters.

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATED', 'UPDATED', 'STATUS_CHANGED');

-- CreateTable
CREATE TABLE "AuditingEvent" (
    "id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "changes" JSONB,
    "actorId" TEXT,
    "actorRole" TEXT,
    "ip" TEXT,
    "route" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- The per-row trail: everything that happened to one transaction, newest first.
CREATE INDEX "AuditingEvent_entity_entityId_createdAt_idx" ON "AuditingEvent"("entity", "entityId", "createdAt" DESC);

-- CreateIndex
-- The unfiltered feed, and the entity-only filter.
CREATE INDEX "AuditingEvent_entity_createdAt_idx" ON "AuditingEvent"("entity", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AuditingEvent_actorId_idx" ON "AuditingEvent"("actorId");
