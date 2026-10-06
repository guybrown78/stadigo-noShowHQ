-- Additive return-to-work tracking. Existing Absence rows are not backfilled.
-- A missing SicknessReturnToWork row means Not recorded.
-- Rollback must be a reviewed forward fix so committed history is never deleted.

CREATE TYPE "SicknessReturnToWorkStatus" AS ENUM (
  'NOT_RECORDED',
  'NOT_REQUIRED',
  'OUTSTANDING',
  'COMPLETED'
);

ALTER TYPE "AbsenceHistoryAction" ADD VALUE 'RETURN_TO_WORK_RECORDED';
ALTER TYPE "AbsenceHistoryAction" ADD VALUE 'RETURN_TO_WORK_CORRECTED';

CREATE TABLE "SicknessReturnToWork" (
    "absenceId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" "SicknessReturnToWorkStatus" NOT NULL,
    "completedOn" DATE,
    "note" VARCHAR(2000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT NOT NULL,

    CONSTRAINT "SicknessReturnToWork_pkey" PRIMARY KEY ("absenceId")
);

CREATE UNIQUE INDEX "SicknessReturnToWork_absenceId_tenantId_key" ON "SicknessReturnToWork"("absenceId", "tenantId");
CREATE INDEX "SicknessReturnToWork_tenantId_idx" ON "SicknessReturnToWork"("tenantId");

ALTER TABLE "SicknessReturnToWork" ADD CONSTRAINT "SicknessReturnToWork_status_date" CHECK (
  (
    "status" = 'COMPLETED'
    AND "completedOn" IS NOT NULL
  )
  OR (
    "status" IN ('NOT_RECORDED', 'NOT_REQUIRED', 'OUTSTANDING')
    AND "completedOn" IS NULL
  )
);

ALTER TABLE "SicknessReturnToWork" ADD CONSTRAINT "SicknessReturnToWork_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SicknessReturnToWork" ADD CONSTRAINT "SicknessReturnToWork_absenceId_tenantId_fkey" FOREIGN KEY ("absenceId", "tenantId") REFERENCES "Absence"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SicknessReturnToWork" ADD CONSTRAINT "SicknessReturnToWork_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SicknessReturnToWork" ADD CONSTRAINT "SicknessReturnToWork_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
