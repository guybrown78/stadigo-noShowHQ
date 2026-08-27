-- CreateEnum
CREATE TYPE "EventImportStatus" AS ENUM (
  'UPLOADED',
  'VALIDATION_FAILED',
  'AWAITING_VENUE_CONFIRMATION',
  'VENUES_CONFIRMED',
  'AWAITING_EVENT_CONFIRMATION',
  'COMPLETED',
  'FAILED',
  'CANCELLED'
);

-- CreateEnum
CREATE TYPE "EventImportRowStatus" AS ENUM ('VALID', 'INVALID', 'IGNORED');

-- CreateEnum
CREATE TYPE "EventImportVenueOutcome" AS ENUM ('MATCHED', 'NEW', 'AMBIGUOUS');

-- CreateTable
CREATE TABLE "EventImport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "invalidRows" INTEGER NOT NULL DEFAULT 0,
    "ignoredRows" INTEGER NOT NULL DEFAULT 0,
    "matchedVenueCount" INTEGER NOT NULL DEFAULT 0,
    "newVenueCount" INTEGER NOT NULL DEFAULT 0,
    "createdVenueCount" INTEGER NOT NULL DEFAULT 0,
    "createdEventCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateEventCount" INTEGER NOT NULL DEFAULT 0,
    "status" "EventImportStatus" NOT NULL DEFAULT 'UPLOADED',
    "failureReason" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "venueConfirmedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "EventImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventImportRow" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sourceRowNumber" INTEGER NOT NULL,
    "raw" JSONB NOT NULL,
    "normalized" JSONB,
    "fieldErrors" JSONB,
    "eventTypeId" TEXT,
    "eventSubtypeId" TEXT,
    "venueKey" TEXT,
    "createdEventId" TEXT,
    "status" "EventImportRowStatus" NOT NULL,

    CONSTRAINT "EventImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventImportVenue" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL,
    "importedName" TEXT NOT NULL,
    "addressLine1" TEXT,
    "townCity" TEXT,
    "postcode" TEXT,
    "outcome" "EventImportVenueOutcome" NOT NULL,
    "matchedVenueId" TEXT,
    "createdVenueId" TEXT,
    "inactiveMatch" BOOLEAN NOT NULL DEFAULT false,
    "eventRowCount" INTEGER NOT NULL,

    CONSTRAINT "EventImportVenue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventImport_tenantId_uploadedAt_idx" ON "EventImport"("tenantId", "uploadedAt");

-- CreateIndex
CREATE INDEX "EventImport_tenantId_status_idx" ON "EventImport"("tenantId", "status");

-- CreateIndex
CREATE INDEX "EventImport_tenantId_fileHash_idx" ON "EventImport"("tenantId", "fileHash");

-- CreateIndex
CREATE INDEX "EventImport_uploadedById_idx" ON "EventImport"("uploadedById");

-- CreateIndex
CREATE UNIQUE INDEX "EventImportRow_importId_sourceRowNumber_key" ON "EventImportRow"("importId", "sourceRowNumber");

-- CreateIndex
CREATE INDEX "EventImportRow_importId_status_idx" ON "EventImportRow"("importId", "status");

-- CreateIndex
CREATE INDEX "EventImportRow_tenantId_idx" ON "EventImportRow"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "EventImportVenue_importId_nameNormalized_key" ON "EventImportVenue"("importId", "nameNormalized");

-- CreateIndex
CREATE INDEX "EventImportVenue_tenantId_idx" ON "EventImportVenue"("tenantId");

-- AddForeignKey
ALTER TABLE "EventImport" ADD CONSTRAINT "EventImport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventImport" ADD CONSTRAINT "EventImport_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventImportRow" ADD CONSTRAINT "EventImportRow_importId_fkey" FOREIGN KEY ("importId") REFERENCES "EventImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventImportRow" ADD CONSTRAINT "EventImportRow_createdEventId_fkey" FOREIGN KEY ("createdEventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventImportVenue" ADD CONSTRAINT "EventImportVenue_importId_fkey" FOREIGN KEY ("importId") REFERENCES "EventImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventImportVenue" ADD CONSTRAINT "EventImportVenue_matchedVenueId_fkey" FOREIGN KEY ("matchedVenueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventImportVenue" ADD CONSTRAINT "EventImportVenue_createdVenueId_fkey" FOREIGN KEY ("createdVenueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
