-- Additive sickness evidence. Existing Absence and SicknessDetail rows are
-- not backfilled. A missing self-certification or fit note means Not recorded.
-- Rollback must be a reviewed forward fix so committed evidence history is
-- never deleted.

CREATE TYPE "SicknessSelfCertificationStatus" AS ENUM (
  'NOT_RECORDED',
  'NOT_REQUIRED',
  'AWAITING',
  'RECEIVED'
);

CREATE TYPE "SicknessFitNoteStatus" AS ENUM (
  'NOT_RECORDED',
  'NOT_REQUIRED',
  'REQUIRED',
  'REQUESTED',
  'RECEIVED'
);

ALTER TYPE "AbsenceHistoryAction" ADD VALUE 'EVIDENCE_RECORDED';
ALTER TYPE "AbsenceHistoryAction" ADD VALUE 'EVIDENCE_CORRECTED';

CREATE TABLE "SicknessSelfCertification" (
    "absenceId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" "SicknessSelfCertificationStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT NOT NULL,

    CONSTRAINT "SicknessSelfCertification_pkey" PRIMARY KEY ("absenceId")
);

CREATE UNIQUE INDEX "SicknessSelfCertification_absenceId_tenantId_key" ON "SicknessSelfCertification"("absenceId", "tenantId");
CREATE INDEX "SicknessSelfCertification_tenantId_idx" ON "SicknessSelfCertification"("tenantId");

CREATE TABLE "SicknessFitNote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "absenceId" TEXT NOT NULL,
    "status" "SicknessFitNoteStatus" NOT NULL,
    "requestedDate" DATE,
    "receivedDate" DATE,
    "note" VARCHAR(2000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT NOT NULL,

    CONSTRAINT "SicknessFitNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SicknessFitNote_id_tenantId_key" ON "SicknessFitNote"("id", "tenantId");
CREATE INDEX "SicknessFitNote_tenantId_absenceId_createdAt_idx" ON "SicknessFitNote"("tenantId", "absenceId", "createdAt");

ALTER TABLE "SicknessFitNote" ADD CONSTRAINT "SicknessFitNote_status_dates" CHECK (
  (
    "status" = 'REQUESTED'
    AND "requestedDate" IS NOT NULL
    AND "receivedDate" IS NULL
  )
  OR (
    "status" = 'RECEIVED'
    AND "receivedDate" IS NOT NULL
  )
  OR (
    "status" IN ('NOT_RECORDED', 'NOT_REQUIRED', 'REQUIRED')
    AND "requestedDate" IS NULL
    AND "receivedDate" IS NULL
  )
);

ALTER TABLE "SicknessSelfCertification" ADD CONSTRAINT "SicknessSelfCertification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SicknessSelfCertification" ADD CONSTRAINT "SicknessSelfCertification_absenceId_tenantId_fkey" FOREIGN KEY ("absenceId", "tenantId") REFERENCES "Absence"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SicknessSelfCertification" ADD CONSTRAINT "SicknessSelfCertification_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SicknessSelfCertification" ADD CONSTRAINT "SicknessSelfCertification_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SicknessFitNote" ADD CONSTRAINT "SicknessFitNote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SicknessFitNote" ADD CONSTRAINT "SicknessFitNote_absenceId_tenantId_fkey" FOREIGN KEY ("absenceId", "tenantId") REFERENCES "Absence"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SicknessFitNote" ADD CONSTRAINT "SicknessFitNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SicknessFitNote" ADD CONSTRAINT "SicknessFitNote_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AbsenceIdempotencyKey" ADD COLUMN "fitNoteId" TEXT;
CREATE INDEX "AbsenceIdempotencyKey_fitNoteId_idx" ON "AbsenceIdempotencyKey"("fitNoteId");
ALTER TABLE "AbsenceIdempotencyKey" ADD CONSTRAINT "AbsenceIdempotencyKey_fitNoteId_fkey" FOREIGN KEY ("fitNoteId") REFERENCES "SicknessFitNote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
