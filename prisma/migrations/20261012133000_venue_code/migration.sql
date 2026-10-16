-- Optional short code, unique inside one organisation. NULL codes do not collide.
ALTER TABLE "Venue" ADD COLUMN "code" TEXT;

CREATE UNIQUE INDEX "Venue_tenantId_code_key" ON "Venue"("tenantId", "code");
