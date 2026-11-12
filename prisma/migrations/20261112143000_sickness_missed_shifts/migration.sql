-- Booked shifts on one sickness record. The parent Absence.eventId stays null.
-- Rollback is a reviewed forward fix: do not drop this table once shifts exist.

ALTER TYPE "AbsenceHistoryAction" ADD VALUE IF NOT EXISTS 'MISSED_SHIFT_ADDED';
ALTER TYPE "AbsenceHistoryAction" ADD VALUE IF NOT EXISTS 'MISSED_SHIFT_REMOVED';

CREATE TABLE "SicknessMissedShift" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "absenceId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "eventNameSnapshot" TEXT NOT NULL,
    "eventReferenceSnapshot" TEXT,
    "eventDateSnapshot" DATE NOT NULL,
    "eventStartTimeSnapshot" TEXT,
    "eventEndTimeSnapshot" TEXT,
    "venueIdSnapshot" TEXT,
    "venueNameSnapshot" TEXT,
    "eventTypeSnapshot" TEXT,
    "eventSubtypeSnapshot" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "SicknessMissedShift_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SicknessMissedShift_id_tenantId_key" ON "SicknessMissedShift"("id", "tenantId");
CREATE UNIQUE INDEX "SicknessMissedShift_absenceId_eventId_key" ON "SicknessMissedShift"("absenceId", "eventId");
CREATE INDEX "SicknessMissedShift_tenantId_absenceId_idx" ON "SicknessMissedShift"("tenantId", "absenceId");
CREATE INDEX "SicknessMissedShift_tenantId_eventDateSnapshot_idx" ON "SicknessMissedShift"("tenantId", "eventDateSnapshot");
CREATE INDEX "SicknessMissedShift_staffId_idx" ON "SicknessMissedShift"("staffId");
CREATE INDEX "SicknessMissedShift_eventId_idx" ON "SicknessMissedShift"("eventId");
CREATE INDEX "SicknessMissedShift_createdById_idx" ON "SicknessMissedShift"("createdById");

CREATE UNIQUE INDEX "SicknessMissedShift_tenant_staff_event_active_key"
  ON "SicknessMissedShift"("tenantId", "staffId", "eventId")
  WHERE "active" = true;

ALTER TABLE "SicknessMissedShift" ADD CONSTRAINT "SicknessMissedShift_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SicknessMissedShift" ADD CONSTRAINT "SicknessMissedShift_absenceId_tenantId_fkey" FOREIGN KEY ("absenceId", "tenantId") REFERENCES "Absence"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SicknessMissedShift" ADD CONSTRAINT "SicknessMissedShift_staffId_tenantId_fkey" FOREIGN KEY ("staffId", "tenantId") REFERENCES "Staff"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SicknessMissedShift" ADD CONSTRAINT "SicknessMissedShift_eventId_tenantId_fkey" FOREIGN KEY ("eventId", "tenantId") REFERENCES "Event"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SicknessMissedShift" ADD CONSTRAINT "SicknessMissedShift_venueIdSnapshot_tenantId_fkey" FOREIGN KEY ("venueIdSnapshot", "tenantId") REFERENCES "Venue"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SicknessMissedShift" ADD CONSTRAINT "SicknessMissedShift_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
