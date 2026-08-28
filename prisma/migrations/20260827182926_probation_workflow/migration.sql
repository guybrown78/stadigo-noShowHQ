-- CreateEnum
CREATE TYPE "StaffProbationCycleStatus" AS ENUM ('IN_PROGRESS', 'PASSED', 'EXTENDED', 'NOT_CONTINUED');

-- CreateEnum
CREATE TYPE "ProbationDurationSource" AS ENUM ('TENANT_DEFAULT', 'INDIVIDUAL_OVERRIDE', 'MANUAL_END_DATE');

-- CreateEnum
CREATE TYPE "StaffProbationTaskType" AS ENUM ('REVIEW_DUE', 'CHASE', 'OVERDUE_ESCALATION');

-- CreateEnum
CREATE TYPE "StaffProbationTaskState" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'SNOOZED', 'RESOLVED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "ProbationStatus" ADD VALUE 'NOT_CONTINUED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StaffProbationAction" ADD VALUE 'DURATION_OVERRIDDEN';
ALTER TYPE "StaffProbationAction" ADD VALUE 'REVIEW_DUE';
ALTER TYPE "StaffProbationAction" ADD VALUE 'REMINDER_CREATED';
ALTER TYPE "StaffProbationAction" ADD VALUE 'REMINDER_ACKNOWLEDGED';
ALTER TYPE "StaffProbationAction" ADD VALUE 'REMINDER_SNOOZED';
ALTER TYPE "StaffProbationAction" ADD VALUE 'NOT_CONTINUED';
ALTER TYPE "StaffProbationAction" ADD VALUE 'OVERDUE_ESCALATED';
ALTER TYPE "StaffProbationAction" ADD VALUE 'LEGACY_RECONCILED';

-- AlterTable
ALTER TABLE "StaffProbationHistory" ADD COLUMN     "newStatus" "StaffProbationCycleStatus",
ADD COLUMN     "previousStatus" "StaffProbationCycleStatus",
ADD COLUMN     "probationId" TEXT,
ADD COLUMN     "systemActor" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "actedById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "defaultProbationUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "defaultProbationUpdatedById" TEXT;

-- CreateTable
CREATE TABLE "StaffProbation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "status" "StaffProbationCycleStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "effectiveDurationDays" INTEGER,
    "durationSource" "ProbationDurationSource" NOT NULL,
    "startDate" DATE NOT NULL,
    "currentEndDate" DATE NOT NULL,
    "reviewDueDate" DATE NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,

    CONSTRAINT "StaffProbation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffProbationTask" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "probationId" TEXT NOT NULL,
    "type" "StaffProbationTaskType" NOT NULL,
    "state" "StaffProbationTaskState" NOT NULL DEFAULT 'OPEN',
    "dueAt" DATE NOT NULL,
    "cadenceKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "systemActor" BOOLEAN NOT NULL DEFAULT true,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedById" TEXT,
    "snoozedUntil" DATE,
    "snoozedById" TEXT,
    "snoozeReason" VARCHAR(2000),
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,

    CONSTRAINT "StaffProbationTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffProbation_tenantId_staffId_idx" ON "StaffProbation"("tenantId", "staffId");

-- CreateIndex
CREATE INDEX "StaffProbation_tenantId_completedAt_currentEndDate_idx" ON "StaffProbation"("tenantId", "completedAt", "currentEndDate");

-- CreateIndex
CREATE INDEX "StaffProbation_tenantId_completedAt_reviewDueDate_idx" ON "StaffProbation"("tenantId", "completedAt", "reviewDueDate");

-- CreateIndex
CREATE INDEX "StaffProbation_staffId_idx" ON "StaffProbation"("staffId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffProbation_id_tenantId_key" ON "StaffProbation"("id", "tenantId");

-- CreateIndex
CREATE INDEX "StaffProbationTask_tenantId_state_type_dueAt_idx" ON "StaffProbationTask"("tenantId", "state", "type", "dueAt");

-- CreateIndex
CREATE INDEX "StaffProbationTask_tenantId_staffId_idx" ON "StaffProbationTask"("tenantId", "staffId");

-- CreateIndex
CREATE INDEX "StaffProbationTask_probationId_state_idx" ON "StaffProbationTask"("probationId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "StaffProbationTask_id_tenantId_key" ON "StaffProbationTask"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffProbationTask_probationId_type_cadenceKey_key" ON "StaffProbationTask"("probationId", "type", "cadenceKey");

-- CreateIndex
CREATE INDEX "StaffProbationHistory_tenantId_probationId_createdAt_idx" ON "StaffProbationHistory"("tenantId", "probationId", "createdAt");

-- AddForeignKey
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_defaultProbationUpdatedById_fkey" FOREIGN KEY ("defaultProbationUpdatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffProbation" ADD CONSTRAINT "StaffProbation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffProbation" ADD CONSTRAINT "StaffProbation_staffId_tenantId_fkey" FOREIGN KEY ("staffId", "tenantId") REFERENCES "Staff"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffProbation" ADD CONSTRAINT "StaffProbation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffProbation" ADD CONSTRAINT "StaffProbation_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffProbationHistory" ADD CONSTRAINT "StaffProbationHistory_probationId_tenantId_fkey" FOREIGN KEY ("probationId", "tenantId") REFERENCES "StaffProbation"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffProbationTask" ADD CONSTRAINT "StaffProbationTask_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffProbationTask" ADD CONSTRAINT "StaffProbationTask_staffId_tenantId_fkey" FOREIGN KEY ("staffId", "tenantId") REFERENCES "Staff"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffProbationTask" ADD CONSTRAINT "StaffProbationTask_probationId_tenantId_fkey" FOREIGN KEY ("probationId", "tenantId") REFERENCES "StaffProbation"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffProbationTask" ADD CONSTRAINT "StaffProbationTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffProbationTask" ADD CONSTRAINT "StaffProbationTask_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffProbationTask" ADD CONSTRAINT "StaffProbationTask_snoozedById_fkey" FOREIGN KEY ("snoozedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffProbationTask" ADD CONSTRAINT "StaffProbationTask_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
