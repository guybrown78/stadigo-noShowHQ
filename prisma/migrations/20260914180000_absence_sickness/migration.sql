-- Preflight: Cancellation and AWOL must keep an Event before Sickness writes are enabled.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Absence"
    WHERE "type" IN ('CANCELLATION', 'AWOL')
      AND "eventId" IS NULL
  ) THEN
    RAISE EXCEPTION 'Preflight failed: Cancellation and AWOL records must have an Event before enabling Sickness';
  END IF;
END $$;

ALTER TABLE "Absence" ADD COLUMN "firstWorkingDaySick" DATE;

CREATE TABLE "SicknessDetail" (
    "absenceId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firstWorkingDaySick" DATE NOT NULL,
    "sicknessStartedDate" DATE,
    "issueSummary" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SicknessDetail_pkey" PRIMARY KEY ("absenceId"),
    CONSTRAINT "SicknessDetail_started_on_or_before_first_working_day"
      CHECK ("sicknessStartedDate" IS NULL OR "sicknessStartedDate" <= "firstWorkingDaySick")
);

CREATE UNIQUE INDEX "SicknessDetail_absenceId_tenantId_key" ON "SicknessDetail"("absenceId", "tenantId");
CREATE INDEX "SicknessDetail_tenantId_idx" ON "SicknessDetail"("tenantId");
CREATE INDEX "SicknessDetail_tenantId_firstWorkingDaySick_idx" ON "SicknessDetail"("tenantId", "firstWorkingDaySick");
CREATE INDEX "Absence_tenantId_staffId_firstWorkingDaySick_idx" ON "Absence"("tenantId", "staffId", "firstWorkingDaySick");

ALTER TABLE "SicknessDetail" ADD CONSTRAINT "SicknessDetail_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SicknessDetail" ADD CONSTRAINT "SicknessDetail_absenceId_tenantId_fkey" FOREIGN KEY ("absenceId", "tenantId") REFERENCES "Absence"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Absence" ADD CONSTRAINT "Absence_event_required_by_type" CHECK (
  ("type" IN ('CANCELLATION', 'AWOL') AND "eventId" IS NOT NULL)
  OR ("type" = 'SICKNESS' AND "eventId" IS NULL)
);

CREATE UNIQUE INDEX "Absence_tenantId_staffId_firstWorkingDaySick_active_sickness_key"
  ON "Absence"("tenantId", "staffId", "firstWorkingDaySick")
  WHERE "recordStatus" = 'ACTIVE'
    AND "type" = 'SICKNESS'
    AND "firstWorkingDaySick" IS NOT NULL;
