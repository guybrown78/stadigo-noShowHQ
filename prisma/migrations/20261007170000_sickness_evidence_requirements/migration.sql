-- Additive sickness evidence requirements. Existing episodes keep a null
-- policy snapshot until a tenant administrator reviews and applies backfill.
-- This migration does not create follow-ups.

CREATE TYPE "AbsenceFollowUpProvenance" AS ENUM ('MANUAL', 'SYSTEM');
CREATE TYPE "AbsenceFollowUpPurpose" AS ENUM ('REQUEST_FIT_NOTE', 'CHASE_FIT_NOTE');
CREATE TYPE "SicknessEvidenceEvaluationStatus" AS ENUM ('SUCCESS', 'FAILED');

ALTER TABLE "Tenant"
  ADD COLUMN "fitNoteRequiredFromDay" INTEGER NOT NULL DEFAULT 8,
  ADD COLUMN "fitNoteChaseAfterDays" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "sicknessEvidenceUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "sicknessEvidenceUpdatedById" TEXT;

ALTER TABLE "SicknessDetail"
  ADD COLUMN "evidenceRequiredFromDay" INTEGER,
  ADD COLUMN "evidenceRequirementDate" DATE,
  ADD COLUMN "evidencePolicyCapturedAt" TIMESTAMP(3);

ALTER TABLE "SicknessFitNote"
  ADD COLUMN "chaseAfterDays" INTEGER,
  ADD COLUMN "chaseDueDate" DATE;

ALTER TABLE "AbsenceFollowUp"
  ADD COLUMN "provenance" "AbsenceFollowUpProvenance" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "purpose" "AbsenceFollowUpPurpose",
  ADD COLUMN "fitNoteId" TEXT,
  ADD COLUMN "systemActor" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "AbsenceFollowUp" ALTER COLUMN "createdById" DROP NOT NULL;

ALTER TABLE "AbsenceHistory" ALTER COLUMN "actedById" DROP NOT NULL;
ALTER TABLE "AbsenceHistory"
  ADD COLUMN "systemActor" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "AbsenceFollowUp" DROP CONSTRAINT "AbsenceFollowUp_state_fields";
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
    AND ("completedById" IS NOT NULL OR "provenance" = 'SYSTEM')
    AND "cancellationReason" IS NULL
    AND "cancelledAt" IS NULL
    AND "cancelledById" IS NULL
  )
  OR (
    "state" = 'CANCELLED'
    AND "cancellationReason" IS NOT NULL
    AND "cancelledAt" IS NOT NULL
    AND ("cancelledById" IS NOT NULL OR "provenance" = 'SYSTEM')
    AND "completionNotes" IS NULL
    AND "completedAt" IS NULL
    AND "completedById" IS NULL
  )
);

ALTER TABLE "AbsenceFollowUp" ADD CONSTRAINT "AbsenceFollowUp_provenance_fields" CHECK (
  (
    "provenance" = 'MANUAL'
    AND "createdById" IS NOT NULL
    AND "systemActor" = false
    AND "purpose" IS NULL
    AND "fitNoteId" IS NULL
  )
  OR (
    "provenance" = 'SYSTEM'
    AND "systemActor" = true
    AND "purpose" IS NOT NULL
    AND (
      ("purpose" = 'REQUEST_FIT_NOTE' AND "fitNoteId" IS NULL)
      OR ("purpose" = 'CHASE_FIT_NOTE' AND "fitNoteId" IS NOT NULL)
    )
  )
);

ALTER TABLE "AbsenceHistory" ADD CONSTRAINT "AbsenceHistory_actor" CHECK (
  ("systemActor" = true AND "actedById" IS NULL)
  OR ("systemActor" = false AND "actedById" IS NOT NULL)
);

CREATE UNIQUE INDEX "AbsenceFollowUp_system_request_open_key"
  ON "AbsenceFollowUp" ("tenantId", "absenceId")
  WHERE "provenance" = 'SYSTEM'
    AND "purpose" = 'REQUEST_FIT_NOTE'
    AND "state" = 'OPEN';

CREATE UNIQUE INDEX "AbsenceFollowUp_system_chase_open_key"
  ON "AbsenceFollowUp" ("tenantId", "fitNoteId")
  WHERE "provenance" = 'SYSTEM'
    AND "purpose" = 'CHASE_FIT_NOTE'
    AND "state" = 'OPEN';

CREATE INDEX "AbsenceFollowUp_fitNoteId_idx" ON "AbsenceFollowUp"("fitNoteId");

CREATE TABLE "TenantSettingsAudit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "previous" TEXT,
    "next" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantSettingsAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TenantSettingsAudit_tenantId_createdAt_idx"
  ON "TenantSettingsAudit"("tenantId", "createdAt");

CREATE TABLE "SicknessEvidenceEvaluationRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "status" "SicknessEvidenceEvaluationStatus" NOT NULL,
    "episodesScanned" INTEGER NOT NULL DEFAULT 0,
    "tasksCreated" INTEGER NOT NULL DEFAULT 0,
    "tasksCompleted" INTEGER NOT NULL DEFAULT 0,
    "tasksCancelled" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" VARCHAR(500),

    CONSTRAINT "SicknessEvidenceEvaluationRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SicknessEvidenceEvaluationRun_tenantId_startedAt_idx"
  ON "SicknessEvidenceEvaluationRun"("tenantId", "startedAt");

ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_sicknessEvidenceUpdatedById_fkey"
  FOREIGN KEY ("sicknessEvidenceUpdatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AbsenceFollowUp" ADD CONSTRAINT "AbsenceFollowUp_fitNoteId_tenantId_fkey"
  FOREIGN KEY ("fitNoteId", "tenantId") REFERENCES "SicknessFitNote"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TenantSettingsAudit" ADD CONSTRAINT "TenantSettingsAudit_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TenantSettingsAudit" ADD CONSTRAINT "TenantSettingsAudit_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SicknessEvidenceEvaluationRun" ADD CONSTRAINT "SicknessEvidenceEvaluationRun_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
