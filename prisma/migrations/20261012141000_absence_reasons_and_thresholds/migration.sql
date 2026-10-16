CREATE TYPE "AbsenceReasonKind" AS ENUM ('CANCELLATION', 'SICKNESS');

ALTER TABLE "Tenant"
  ADD COLUMN "shortNoticeHours" INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN "payPeriodStartDay" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "cancellationThreshold" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "awolThresholdCount" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "awolWindowDays" INTEGER NOT NULL DEFAULT 30;

CREATE TABLE "AbsenceReason" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "kind" "AbsenceReasonKind" NOT NULL,
  "label" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AbsenceReason_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AbsenceReason_tenantId_kind_label_key" ON "AbsenceReason"("tenantId", "kind", "label");
CREATE INDEX "AbsenceReason_tenantId_kind_active_sortOrder_idx" ON "AbsenceReason"("tenantId", "kind", "active", "sortOrder");

ALTER TABLE "AbsenceReason"
  ADD CONSTRAINT "AbsenceReason_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "StaffAwolFollowUp" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "contact1At" DATE,
  "contact2At" DATE,
  "formalProcessAt" DATE,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StaffAwolFollowUp_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StaffAwolFollowUp_staffId_tenantId_key" ON "StaffAwolFollowUp"("staffId", "tenantId");
CREATE INDEX "StaffAwolFollowUp_tenantId_idx" ON "StaffAwolFollowUp"("tenantId");

ALTER TABLE "StaffAwolFollowUp"
  ADD CONSTRAINT "StaffAwolFollowUp_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StaffAwolFollowUp"
  ADD CONSTRAINT "StaffAwolFollowUp_staffId_tenantId_fkey"
  FOREIGN KEY ("staffId", "tenantId") REFERENCES "Staff"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
