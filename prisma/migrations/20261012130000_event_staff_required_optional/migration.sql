-- Staffing can be unknown when an event is first created.
-- The existing range check allows NULL: a CHECK passes when the expression is unknown.
ALTER TABLE "Event" ALTER COLUMN "staffRequired" DROP NOT NULL;
