-- Sickness Part 3: explicit episode state and nullable end date.
-- Existing records stay NOT_CONFIRMED with a null end date. Do not invent
-- ongoing status or end dates. Rollback must be a reviewed forward fix so a
-- later-recorded end date is never discarded.

CREATE TYPE "SicknessEpisodeState" AS ENUM ('NOT_CONFIRMED', 'ONGOING', 'ENDED');

ALTER TYPE "AbsenceHistoryAction" ADD VALUE 'EPISODE_UPDATED';

ALTER TABLE "SicknessDetail"
  ADD COLUMN "sicknessEndedDate" DATE,
  ADD COLUMN "episodeState" "SicknessEpisodeState" NOT NULL DEFAULT 'NOT_CONFIRMED';

ALTER TABLE "SicknessDetail"
  ADD CONSTRAINT "SicknessDetail_episode_state_matches_end_date" CHECK (
    ("episodeState" = 'ENDED' AND "sicknessEndedDate" IS NOT NULL)
    OR ("episodeState" IN ('NOT_CONFIRMED', 'ONGOING') AND "sicknessEndedDate" IS NULL)
  ),
  ADD CONSTRAINT "SicknessDetail_ended_on_or_after_first_working_day" CHECK (
    "sicknessEndedDate" IS NULL OR "sicknessEndedDate" >= "firstWorkingDaySick"
  ),
  ADD CONSTRAINT "SicknessDetail_ended_on_or_after_started" CHECK (
    "sicknessEndedDate" IS NULL
    OR "sicknessStartedDate" IS NULL
    OR "sicknessEndedDate" >= "sicknessStartedDate"
  );
