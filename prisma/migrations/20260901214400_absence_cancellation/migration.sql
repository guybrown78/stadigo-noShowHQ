-- CreateEnum
CREATE TYPE "AbsenceType" AS ENUM ('CANCELLATION', 'AWOL', 'SICKNESS');

-- CreateEnum
CREATE TYPE "AbsenceFollowUpType" AS ENUM ('REVIEW');

-- CreateEnum
CREATE TYPE "AbsenceFollowUpStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'NOT_REQUIRED');

-- CreateEnum
CREATE TYPE "AbsenceRecordStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AbsenceNoticeBasis" AS ENUM ('EXACT_TIME', 'CALENDAR_DATE');

-- CreateEnum
CREATE TYPE "AbsenceHistoryAction" AS ENUM ('CREATED', 'CORRECTED', 'ARCHIVED');

-- AlterTable
CREATE UNIQUE INDEX "Event_id_tenantId_key" ON "Event"("id", "tenantId");

-- CreateTable
CREATE TABLE "Absence" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "eventId" TEXT,
    "type" "AbsenceType" NOT NULL,
    "reportedDate" DATE NOT NULL,
    "reportedTime" TEXT,
    "reason" VARCHAR(1000) NOT NULL,
    "notes" VARCHAR(2000),
    "followUpType" "AbsenceFollowUpType" NOT NULL,
    "followUpStatus" "AbsenceFollowUpStatus" NOT NULL,
    "recordStatus" "AbsenceRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "archivedById" TEXT,
    "archiveReason" VARCHAR(500),

    CONSTRAINT "Absence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CancellationDetail" (
    "absenceId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventNameSnapshot" TEXT NOT NULL,
    "eventDateSnapshot" DATE NOT NULL,
    "eventStartTimeSnapshot" TEXT,
    "venueIdSnapshot" TEXT,
    "venueNameSnapshot" TEXT,
    "noticeMinutes" INTEGER,
    "noticeCalendarDays" INTEGER NOT NULL,
    "noticeBasis" "AbsenceNoticeBasis" NOT NULL,
    "isShortNotice" BOOLEAN NOT NULL,

    CONSTRAINT "CancellationDetail_pkey" PRIMARY KEY ("absenceId")
);

-- CreateTable
CREATE TABLE "AbsenceHistory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "absenceId" TEXT NOT NULL,
    "action" "AbsenceHistoryAction" NOT NULL,
    "reason" VARCHAR(500),
    "changes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actedById" TEXT NOT NULL,

    CONSTRAINT "AbsenceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Absence_id_tenantId_key" ON "Absence"("id", "tenantId");

-- CreateIndex
CREATE INDEX "Absence_tenantId_staffId_recordStatus_idx" ON "Absence"("tenantId", "staffId", "recordStatus");

-- CreateIndex
CREATE INDEX "Absence_tenantId_eventId_idx" ON "Absence"("tenantId", "eventId");

-- CreateIndex
CREATE INDEX "Absence_tenantId_type_recordStatus_idx" ON "Absence"("tenantId", "type", "recordStatus");

-- CreateIndex
CREATE INDEX "Absence_tenantId_followUpStatus_recordStatus_idx" ON "Absence"("tenantId", "followUpStatus", "recordStatus");

-- CreateIndex
CREATE INDEX "Absence_staffId_idx" ON "Absence"("staffId");

-- One active Cancellation/AWOL per tenant/staff/event
CREATE UNIQUE INDEX "Absence_tenantId_staffId_eventId_type_active_key"
  ON "Absence"("tenantId", "staffId", "eventId", "type")
  WHERE "recordStatus" = 'ACTIVE' AND "eventId" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "CancellationDetail_absenceId_tenantId_key" ON "CancellationDetail"("absenceId", "tenantId");

-- CreateIndex
CREATE INDEX "CancellationDetail_tenantId_idx" ON "CancellationDetail"("tenantId");

-- CreateIndex
CREATE INDEX "AbsenceHistory_tenantId_absenceId_createdAt_idx" ON "AbsenceHistory"("tenantId", "absenceId", "createdAt");

-- CreateIndex
CREATE INDEX "AbsenceHistory_absenceId_idx" ON "AbsenceHistory"("absenceId");

-- AddForeignKey
ALTER TABLE "Absence" ADD CONSTRAINT "Absence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Absence" ADD CONSTRAINT "Absence_staffId_tenantId_fkey" FOREIGN KEY ("staffId", "tenantId") REFERENCES "Staff"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Absence" ADD CONSTRAINT "Absence_eventId_tenantId_fkey" FOREIGN KEY ("eventId", "tenantId") REFERENCES "Event"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Absence" ADD CONSTRAINT "Absence_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Absence" ADD CONSTRAINT "Absence_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Absence" ADD CONSTRAINT "Absence_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CancellationDetail" ADD CONSTRAINT "CancellationDetail_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CancellationDetail" ADD CONSTRAINT "CancellationDetail_absenceId_tenantId_fkey" FOREIGN KEY ("absenceId", "tenantId") REFERENCES "Absence"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CancellationDetail" ADD CONSTRAINT "CancellationDetail_venueIdSnapshot_tenantId_fkey" FOREIGN KEY ("venueIdSnapshot", "tenantId") REFERENCES "Venue"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbsenceHistory" ADD CONSTRAINT "AbsenceHistory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbsenceHistory" ADD CONSTRAINT "AbsenceHistory_absenceId_tenantId_fkey" FOREIGN KEY ("absenceId", "tenantId") REFERENCES "Absence"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbsenceHistory" ADD CONSTRAINT "AbsenceHistory_actedById_fkey" FOREIGN KEY ("actedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
