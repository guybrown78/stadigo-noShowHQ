-- A cancellation stays a cancellation. Unauthorised is a mark on that record.
ALTER TABLE "CancellationDetail"
  ADD COLUMN "unauthorised" BOOLEAN NOT NULL DEFAULT false;

ALTER TYPE "AbsenceHistoryAction" ADD VALUE 'UNAUTHORISED_UPDATED';
