-- CreateEnum
CREATE TYPE "StaffImportStatus" AS ENUM ('UPLOADED', 'VALIDATION_FAILED', 'AWAITING_CONFIRMATION', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StaffImportRowStatus" AS ENUM ('VALID', 'INVALID', 'IGNORED');

-- CreateTable
CREATE TABLE "StaffImport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "invalidRows" INTEGER NOT NULL DEFAULT 0,
    "ignoredRows" INTEGER NOT NULL DEFAULT 0,
    "existingManagerMatchCount" INTEGER NOT NULL DEFAULT 0,
    "importedManagerMatchCount" INTEGER NOT NULL DEFAULT 0,
    "createdStaffCount" INTEGER NOT NULL DEFAULT 0,
    "createdProbationCount" INTEGER NOT NULL DEFAULT 0,
    "status" "StaffImportStatus" NOT NULL DEFAULT 'UPLOADED',
    "failureReason" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "StaffImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffImportRow" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sourceRowNumber" INTEGER NOT NULL,
    "raw" JSONB NOT NULL,
    "normalized" JSONB,
    "fieldErrors" JSONB,
    "managerOutcome" JSONB,
    "probationPreview" JSONB,
    "createdStaffId" TEXT,
    "status" "StaffImportRowStatus" NOT NULL,

    CONSTRAINT "StaffImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffImport_tenantId_uploadedAt_idx" ON "StaffImport"("tenantId", "uploadedAt");

-- CreateIndex
CREATE INDEX "StaffImport_tenantId_status_idx" ON "StaffImport"("tenantId", "status");

-- CreateIndex
CREATE INDEX "StaffImport_tenantId_fileHash_idx" ON "StaffImport"("tenantId", "fileHash");

-- CreateIndex
CREATE INDEX "StaffImport_uploadedById_idx" ON "StaffImport"("uploadedById");

-- CreateIndex
CREATE INDEX "StaffImportRow_importId_status_idx" ON "StaffImportRow"("importId", "status");

-- CreateIndex
CREATE INDEX "StaffImportRow_tenantId_idx" ON "StaffImportRow"("tenantId");

-- CreateIndex
CREATE INDEX "StaffImportRow_createdStaffId_idx" ON "StaffImportRow"("createdStaffId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffImportRow_importId_sourceRowNumber_key" ON "StaffImportRow"("importId", "sourceRowNumber");

-- AddForeignKey
ALTER TABLE "StaffImport" ADD CONSTRAINT "StaffImport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffImport" ADD CONSTRAINT "StaffImport_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffImportRow" ADD CONSTRAINT "StaffImportRow_importId_fkey" FOREIGN KEY ("importId") REFERENCES "StaffImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffImportRow" ADD CONSTRAINT "StaffImportRow_createdStaffId_fkey" FOREIGN KEY ("createdStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
