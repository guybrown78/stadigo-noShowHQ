-- Additive manual follow-up foundation.
-- Existing Absence rows are not backfilled. Parent followUpType / followUpStatus
-- stay the placeholder columns. Rollback must be a reviewed forward fix so
-- committed follow-up history is never deleted.

CREATE TYPE "AbsenceFollowUpState" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED');

ALTER TYPE "AbsenceHistoryAction" ADD VALUE 'FOLLOW_UP_CREATED';
ALTER TYPE "AbsenceHistoryAction" ADD VALUE 'FOLLOW_UP_UPDATED';
ALTER TYPE "AbsenceHistoryAction" ADD VALUE 'FOLLOW_UP_COMPLETED';
ALTER TYPE "AbsenceHistoryAction" ADD VALUE 'FOLLOW_UP_CANCELLED';

CREATE TABLE "AbsenceFollowUp" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "absenceId" TEXT NOT NULL,
    "state" "AbsenceFollowUpState" NOT NULL DEFAULT 'OPEN',
    "dueDate" DATE NOT NULL,
    "details" VARCHAR(2000) NOT NULL,
    "completionNotes" VARCHAR(2000),
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "cancellationReason" VARCHAR(500),
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AbsenceFollowUp_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AbsenceFollowUp_id_tenantId_key" ON "AbsenceFollowUp"("id", "tenantId");
CREATE INDEX "AbsenceFollowUp_tenantId_state_dueDate_createdAt_id_idx" ON "AbsenceFollowUp"("tenantId", "state", "dueDate", "createdAt", "id");
CREATE INDEX "AbsenceFollowUp_tenantId_absenceId_createdAt_idx" ON "AbsenceFollowUp"("tenantId", "absenceId", "createdAt");

ALTER TABLE "AbsenceFollowUp" ADD CONSTRAINT "AbsenceFollowUp_state_fields" CHECK (
  (
    "state" = 'OPEN'
    AND "completionNotes" IS NULL
    AND "completedAt" IS NULL
    AND "completedById" IS NULL
    AND "cancellationReason" IS NULL
    AND "cancelledAt" IS NULL
    AND "cancelledById" IS NULL
  )
  OR (
    "state" = 'COMPLETED'
    AND "completionNotes" IS NOT NULL
    AND "completedAt" IS NOT NULL
    AND "completedById" IS NOT NULL
    AND "cancellationReason" IS NULL
    AND "cancelledAt" IS NULL
    AND "cancelledById" IS NULL
  )
  OR (
    "state" = 'CANCELLED'
    AND "cancellationReason" IS NOT NULL
    AND "cancelledAt" IS NOT NULL
    AND "cancelledById" IS NOT NULL
    AND "completionNotes" IS NULL
    AND "completedAt" IS NULL
    AND "completedById" IS NULL
  )
);

ALTER TABLE "AbsenceFollowUp" ADD CONSTRAINT "AbsenceFollowUp_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AbsenceFollowUp" ADD CONSTRAINT "AbsenceFollowUp_absenceId_tenantId_fkey" FOREIGN KEY ("absenceId", "tenantId") REFERENCES "Absence"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AbsenceFollowUp" ADD CONSTRAINT "AbsenceFollowUp_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AbsenceFollowUp" ADD CONSTRAINT "AbsenceFollowUp_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AbsenceFollowUp" ADD CONSTRAINT "AbsenceFollowUp_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AbsenceIdempotencyKey" ADD COLUMN "followUpId" TEXT;
CREATE INDEX "AbsenceIdempotencyKey_followUpId_idx" ON "AbsenceIdempotencyKey"("followUpId");
ALTER TABLE "AbsenceIdempotencyKey" ADD CONSTRAINT "AbsenceIdempotencyKey_followUpId_fkey" FOREIGN KEY ("followUpId") REFERENCES "AbsenceFollowUp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
