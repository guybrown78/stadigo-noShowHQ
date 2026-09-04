-- Ledger list: tenant + type + status + reported date (replaces the 3-column prefix index).
DROP INDEX IF EXISTS "Absence_tenantId_type_recordStatus_idx";

CREATE INDEX "Absence_tenantId_type_recordStatus_reportedDate_idx"
  ON "Absence"("tenantId", "type", "recordStatus", "reportedDate");

-- Ledger Event-date sort uses the Cancellation snapshot date.
CREATE INDEX "CancellationDetail_tenantId_eventDateSnapshot_idx"
  ON "CancellationDetail"("tenantId", "eventDateSnapshot");
