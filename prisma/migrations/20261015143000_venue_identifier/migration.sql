ALTER TABLE "Tenant" ADD COLUMN "venueSeq" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Venue" ADD COLUMN "identifier" TEXT;

WITH numbered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY "tenantId" ORDER BY "createdAt", id) AS n
  FROM "Venue"
)
UPDATE "Venue" AS venue
SET "identifier" = 'VEN-' || numbered.n::text
FROM numbered
WHERE venue.id = numbered.id;

UPDATE "Tenant" AS tenant
SET "venueSeq" = COALESCE((
  SELECT COUNT(*)::int FROM "Venue" AS venue WHERE venue."tenantId" = tenant.id
), 0);

ALTER TABLE "Venue" ALTER COLUMN "identifier" SET NOT NULL;

CREATE UNIQUE INDEX "Venue_tenantId_identifier_key" ON "Venue"("tenantId", "identifier");
