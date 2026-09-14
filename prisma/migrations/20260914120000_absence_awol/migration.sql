-- Tenant operating timezone for AWOL date/time eligibility.
ALTER TABLE "Tenant" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Europe/London';

-- AWOL does not use Cancellation reason.
ALTER TABLE "Absence" ALTER COLUMN "reason" DROP NOT NULL;

-- Shared active Cancellation/AWOL slot: one live record per tenant/staff/event.
DROP INDEX IF EXISTS "Absence_tenantId_staffId_eventId_type_active_key";

CREATE UNIQUE INDEX "Absence_tenantId_staffId_eventId_active_cancellation_awol_key"
  ON "Absence"("tenantId", "staffId", "eventId")
  WHERE "recordStatus" = 'ACTIVE'
    AND "eventId" IS NOT NULL
    AND "type" IN ('CANCELLATION', 'AWOL');

CREATE TABLE "AwolDetail" (
    "absenceId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventNameSnapshot" TEXT NOT NULL,
    "eventReferenceSnapshot" TEXT,
    "eventDateSnapshot" DATE NOT NULL,
    "eventStartTimeSnapshot" TEXT,
    "eventEndTimeSnapshot" TEXT,
    "venueIdSnapshot" TEXT,
    "venueNameSnapshot" TEXT,
    "eventTypeSnapshot" TEXT,
    "eventSubtypeSnapshot" TEXT,
    "sameDayStartUnknownConfirmed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AwolDetail_pkey" PRIMARY KEY ("absenceId")
);

CREATE UNIQUE INDEX "AwolDetail_absenceId_tenantId_key" ON "AwolDetail"("absenceId", "tenantId");
CREATE INDEX "AwolDetail_tenantId_idx" ON "AwolDetail"("tenantId");
CREATE INDEX "AwolDetail_tenantId_eventDateSnapshot_idx" ON "AwolDetail"("tenantId", "eventDateSnapshot");

ALTER TABLE "AwolDetail" ADD CONSTRAINT "AwolDetail_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AwolDetail" ADD CONSTRAINT "AwolDetail_absenceId_tenantId_fkey" FOREIGN KEY ("absenceId", "tenantId") REFERENCES "Absence"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AwolDetail" ADD CONSTRAINT "AwolDetail_venueIdSnapshot_tenantId_fkey" FOREIGN KEY ("venueIdSnapshot", "tenantId") REFERENCES "Venue"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AbsenceIdempotencyKey" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "absenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AbsenceIdempotencyKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AbsenceIdempotencyKey_tenantId_actorId_operation_key_key"
  ON "AbsenceIdempotencyKey"("tenantId", "actorId", "operation", "key");
CREATE INDEX "AbsenceIdempotencyKey_expiresAt_idx" ON "AbsenceIdempotencyKey"("expiresAt");
CREATE INDEX "AbsenceIdempotencyKey_absenceId_idx" ON "AbsenceIdempotencyKey"("absenceId");

ALTER TABLE "AbsenceIdempotencyKey" ADD CONSTRAINT "AbsenceIdempotencyKey_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AbsenceIdempotencyKey" ADD CONSTRAINT "AbsenceIdempotencyKey_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AbsenceIdempotencyKey" ADD CONSTRAINT "AbsenceIdempotencyKey_absenceId_fkey" FOREIGN KEY ("absenceId") REFERENCES "Absence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
