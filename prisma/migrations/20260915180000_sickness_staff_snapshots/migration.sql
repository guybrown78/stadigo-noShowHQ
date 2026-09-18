-- Staff display snapshots for the Sickness Ledger. Backfill uses current
-- same-tenant Staff names and IDs, not names at original report time.
ALTER TABLE "SicknessDetail"
  ADD COLUMN "staffFirstNameSnapshot" TEXT,
  ADD COLUMN "staffLastNameSnapshot" TEXT,
  ADD COLUMN "staffIdNumberSnapshot" TEXT;

UPDATE "SicknessDetail" AS s
SET
  "staffFirstNameSnapshot" = st."firstName",
  "staffLastNameSnapshot" = st."lastName",
  "staffIdNumberSnapshot" = st."staffIdNumber"
FROM "Absence" AS a
JOIN "Staff" AS st ON st.id = a."staffId" AND st."tenantId" = a."tenantId"
WHERE s."absenceId" = a.id AND s."tenantId" = a."tenantId";

ALTER TABLE "SicknessDetail"
  ALTER COLUMN "staffFirstNameSnapshot" SET NOT NULL,
  ALTER COLUMN "staffLastNameSnapshot" SET NOT NULL,
  ALTER COLUMN "staffIdNumberSnapshot" SET NOT NULL;

-- Default Sickness Ledger order: tenant + type + status + first working day.
CREATE INDEX "Absence_tenantId_type_recordStatus_firstWorkingDaySick_idx"
  ON "Absence"("tenantId", "type", "recordStatus", "firstWorkingDaySick");
