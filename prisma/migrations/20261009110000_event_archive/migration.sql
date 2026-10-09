-- Reversible archive, separate from soft delete. Existing events stay active.

ALTER TABLE "Event"
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "archivedById" TEXT;

ALTER TABLE "Event"
  ADD CONSTRAINT "Event_archivedById_fkey"
  FOREIGN KEY ("archivedById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Event_tenantId_deletedAt_archivedAt_eventDate_idx"
  ON "Event"("tenantId", "deletedAt", "archivedAt", "eventDate");
