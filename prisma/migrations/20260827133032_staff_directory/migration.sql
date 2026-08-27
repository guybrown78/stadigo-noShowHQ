-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('ACTIVE', 'MONITORING', 'CONTACT_REQUIRED', 'DISABLED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ProbationStatus" AS ENUM ('NOT_APPLICABLE', 'IN_PROGRESS', 'PASSED', 'EXTENDED');

-- CreateEnum
CREATE TYPE "SecurityClearanceStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'VALID', 'EXPIRED', 'NOT_RECORDED');

-- CreateEnum
CREATE TYPE "StaffProbationAction" AS ENUM ('STARTED', 'END_DATE_OVERRIDDEN', 'EXTENDED', 'PASSED', 'STATUS_CHANGED');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "defaultProbationDays" INTEGER NOT NULL DEFAULT 90;

-- CreateTable
CREATE TABLE "Staff" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "staffIdNumber" TEXT NOT NULL,
    "staffIdNormalized" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "department" TEXT,
    "roleTitle" TEXT NOT NULL,
    "managerStaffId" TEXT,
    "employmentStatus" "EmploymentStatus" NOT NULL DEFAULT 'ACTIVE',
    "startDate" DATE,
    "probationLengthDays" INTEGER,
    "probationEndDate" DATE,
    "probationEndDateOverridden" BOOLEAN NOT NULL DEFAULT false,
    "probationStatus" "ProbationStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "probationReviewDueDate" DATE,
    "securityClearanceStatus" "SecurityClearanceStatus" NOT NULL DEFAULT 'NOT_RECORDED',
    "securityClearanceExpiryDate" DATE,
    "notes" VARCHAR(2000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,

    CONSTRAINT "Staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffProbationHistory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "action" "StaffProbationAction" NOT NULL,
    "previousEndDate" DATE,
    "newEndDate" DATE,
    "notes" VARCHAR(2000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actedById" TEXT NOT NULL,

    CONSTRAINT "StaffProbationHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Staff_tenantId_staffIdNormalized_idx" ON "Staff"("tenantId", "staffIdNormalized");

-- CreateIndex
CREATE INDEX "Staff_tenantId_lastName_firstName_idx" ON "Staff"("tenantId", "lastName", "firstName");

-- CreateIndex
CREATE INDEX "Staff_tenantId_employmentStatus_idx" ON "Staff"("tenantId", "employmentStatus");

-- CreateIndex
CREATE INDEX "Staff_tenantId_department_idx" ON "Staff"("tenantId", "department");

-- CreateIndex
CREATE INDEX "Staff_tenantId_probationStatus_idx" ON "Staff"("tenantId", "probationStatus");

-- CreateIndex
CREATE INDEX "Staff_tenantId_securityClearanceStatus_idx" ON "Staff"("tenantId", "securityClearanceStatus");

-- CreateIndex
CREATE INDEX "Staff_tenantId_deletedAt_idx" ON "Staff"("tenantId", "deletedAt");

-- CreateIndex
CREATE INDEX "Staff_managerStaffId_idx" ON "Staff"("managerStaffId");

-- CreateIndex
CREATE UNIQUE INDEX "Staff_id_tenantId_key" ON "Staff"("id", "tenantId");

-- Tenant-scoped staff ID uniqueness among non-deleted records only
CREATE UNIQUE INDEX "Staff_tenantId_staffIdNormalized_alive_key" ON "Staff"("tenantId", "staffIdNormalized") WHERE "deletedAt" IS NULL;

-- CreateIndex
CREATE INDEX "StaffProbationHistory_tenantId_staffId_createdAt_idx" ON "StaffProbationHistory"("tenantId", "staffId", "createdAt");

-- CreateIndex
CREATE INDEX "StaffProbationHistory_staffId_idx" ON "StaffProbationHistory"("staffId");

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_managerStaffId_tenantId_fkey" FOREIGN KEY ("managerStaffId", "tenantId") REFERENCES "Staff"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffProbationHistory" ADD CONSTRAINT "StaffProbationHistory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffProbationHistory" ADD CONSTRAINT "StaffProbationHistory_staffId_tenantId_fkey" FOREIGN KEY ("staffId", "tenantId") REFERENCES "Staff"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffProbationHistory" ADD CONSTRAINT "StaffProbationHistory_actedById_fkey" FOREIGN KEY ("actedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
