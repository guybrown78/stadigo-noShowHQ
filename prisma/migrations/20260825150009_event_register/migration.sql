-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('PLANNED', 'CONFIRMED', 'CANCELLED', 'COMPLETED');

-- CreateTable
CREATE TABLE "EventType" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventSubtype" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventTypeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventSubtype_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Venue" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL,
    "addressLine1" TEXT,
    "townCity" TEXT,
    "postcode" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/London',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reference" TEXT,
    "name" TEXT NOT NULL,
    "eventTypeId" TEXT NOT NULL,
    "eventSubtypeId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "eventDate" DATE NOT NULL,
    "briefingTime" TEXT,
    "startTime" TEXT,
    "endTime" TEXT,
    "endsNextDay" BOOLEAN NOT NULL DEFAULT false,
    "staffRequired" INTEGER NOT NULL,
    "warningFillRate" INTEGER NOT NULL DEFAULT 90,
    "criticalFillRate" INTEGER NOT NULL DEFAULT 85,
    "status" "EventStatus" NOT NULL DEFAULT 'PLANNED',
    "notes" VARCHAR(2000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventType_tenantId_active_idx" ON "EventType"("tenantId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "EventType_id_tenantId_key" ON "EventType"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "EventType_tenantId_code_key" ON "EventType"("tenantId", "code");

-- CreateIndex
CREATE INDEX "EventSubtype_tenantId_eventTypeId_active_idx" ON "EventSubtype"("tenantId", "eventTypeId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "EventSubtype_id_eventTypeId_key" ON "EventSubtype"("id", "eventTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "EventSubtype_tenantId_eventTypeId_code_key" ON "EventSubtype"("tenantId", "eventTypeId", "code");

-- CreateIndex
CREATE INDEX "Venue_tenantId_active_idx" ON "Venue"("tenantId", "active");

-- CreateIndex
CREATE INDEX "Venue_tenantId_name_idx" ON "Venue"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Venue_id_tenantId_key" ON "Venue"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Venue_tenantId_nameNormalized_key" ON "Venue"("tenantId", "nameNormalized");

-- CreateIndex
CREATE INDEX "Event_tenantId_deletedAt_eventDate_idx" ON "Event"("tenantId", "deletedAt", "eventDate");

-- CreateIndex
CREATE INDEX "Event_tenantId_status_idx" ON "Event"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Event_tenantId_eventTypeId_idx" ON "Event"("tenantId", "eventTypeId");

-- CreateIndex
CREATE INDEX "Event_tenantId_name_idx" ON "Event"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Event_tenantId_reference_idx" ON "Event"("tenantId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "Event_tenantId_reference_key" ON "Event"("tenantId", "reference");

-- AddForeignKey
ALTER TABLE "EventType" ADD CONSTRAINT "EventType_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSubtype" ADD CONSTRAINT "EventSubtype_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSubtype" ADD CONSTRAINT "EventSubtype_eventTypeId_tenantId_fkey" FOREIGN KEY ("eventTypeId", "tenantId") REFERENCES "EventType"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venue" ADD CONSTRAINT "Venue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_eventTypeId_tenantId_fkey" FOREIGN KEY ("eventTypeId", "tenantId") REFERENCES "EventType"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_eventSubtypeId_eventTypeId_fkey" FOREIGN KEY ("eventSubtypeId", "eventTypeId") REFERENCES "EventSubtype"("id", "eventTypeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_venueId_tenantId_fkey" FOREIGN KEY ("venueId", "tenantId") REFERENCES "Venue"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Event" ADD CONSTRAINT "Event_staffRequired_range" CHECK ("staffRequired" >= 1 AND "staffRequired" <= 100000);
ALTER TABLE "Event" ADD CONSTRAINT "Event_warningFillRate_range" CHECK ("warningFillRate" >= 1 AND "warningFillRate" <= 100);
ALTER TABLE "Event" ADD CONSTRAINT "Event_criticalFillRate_range" CHECK ("criticalFillRate" >= 1 AND "criticalFillRate" <= 100);
ALTER TABLE "Event" ADD CONSTRAINT "Event_fillRate_order" CHECK ("criticalFillRate" < "warningFillRate");
