-- Per-account appearance. Light until the person chooses otherwise.
CREATE TYPE "ColorScheme" AS ENUM ('LIGHT', 'DARK');

ALTER TABLE "User" ADD COLUMN "colorScheme" "ColorScheme" NOT NULL DEFAULT 'LIGHT';
