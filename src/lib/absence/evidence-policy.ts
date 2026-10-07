import type { SicknessEpisodeState } from "@prisma/client";
import { formatLocalDateIso, parseLocalDate } from "@/lib/events/dates";
import { MAX_PROBATION_DAYS } from "@/lib/staff/catalog";
import { addCalendarDays } from "@/lib/staff/probation";

/** Same whole-number ceiling as probation length, so the field stays bounded. */
export const SICKNESS_EVIDENCE_DAY_COUNT_MAX = MAX_PROBATION_DAYS;
export const DEFAULT_FIT_NOTE_REQUIRED_FROM_DAY = 8;
export const DEFAULT_FIT_NOTE_CHASE_AFTER_DAYS = 5;

export const SICKNESS_EVIDENCE_DAY_COUNT_MESSAGE = `Enter a whole number from 1 to ${SICKNESS_EVIDENCE_DAY_COUNT_MAX}.`;

export const EVIDENCE_SETTINGS_PROSPECTIVE =
  "Applies to new episodes and new requests. Existing ones keep their dates.";

export const EVIDENCE_REQUIRED_FROM_HELP =
  "Day 1 is the first sickness date. Weekends count.";

export const EVIDENCE_CHASE_AFTER_HELP =
  "Days after the request date. Weekends count.";

export const REQUEST_FIT_NOTE_DETAILS = "Request a fit note and record it as Requested.";

export const CHASE_FIT_NOTE_DETAILS =
  "Chase the fit note request. Completing this does not mark it received.";

export const REQUEST_TASK_COMPLETED_OUTCOME = "Fit note recorded as Requested.";

export const CHASE_TASK_COMPLETED_OUTCOME = "Fit note recorded as Received.";

export const SYSTEM_REQUEST_CANCEL_REASON = "Fit note request no longer needed.";

export const SYSTEM_CHASE_CANCEL_REASON = "Fit note is no longer requested.";

export const EVIDENCE_CONFIRMATION_NEEDED =
  "Confirm whether this sickness is ongoing or ended before a fit note date is set.";

export const EVIDENCE_POLICY_INACTIVE = "Fit note timing is not set on this sickness.";

export const EVIDENCE_BELOW_THRESHOLD = "Not due yet.";

export const EVIDENCE_RECEIPT_BOUNDARY =
  "A received fit note stops the automatic request for this sickness.";

export function parseEvidenceDayCount(
  raw: string,
): { ok: true; value: number } | { ok: false; message: string } {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    return { ok: false, message: SICKNESS_EVIDENCE_DAY_COUNT_MESSAGE };
  }
  const value = Number(trimmed);
  if (
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > SICKNESS_EVIDENCE_DAY_COUNT_MAX
  ) {
    return { ok: false, message: SICKNESS_EVIDENCE_DAY_COUNT_MESSAGE };
  }
  return { ok: true, value };
}

export function sicknessDayOneIso(params: {
  sicknessStartedDateIso: string | null;
  firstWorkingDaySickIso: string;
}): string {
  const started = params.sicknessStartedDateIso;
  if (started && started <= params.firstWorkingDaySickIso) {
    return started;
  }
  return params.firstWorkingDaySickIso;
}

export function addIsoCalendarDays(iso: string, days: number): string | null {
  const parsed = parseLocalDate(iso);
  if (!parsed) {
    return null;
  }
  return formatLocalDateIso(addCalendarDays(parsed, days));
}

export function requirementDateIso(
  dayOneIso: string,
  requiredFromDay: number,
): string | null {
  return addIsoCalendarDays(dayOneIso, requiredFromDay - 1);
}

export function chaseDueDateIso(
  requestedDateIso: string,
  chaseAfterDays: number,
): string | null {
  return addIsoCalendarDays(requestedDateIso, chaseAfterDays);
}

export type EvidenceRequirementView =
  | { kind: "inactive" }
  | {
      kind: "confirmation_needed";
      requiredFromDay: number;
      requirementDate: string;
    }
  | {
      kind: "not_reached";
      requiredFromDay: number;
      requirementDate: string;
    }
  | {
      kind: "reached";
      requiredFromDay: number;
      requirementDate: string;
    };

export function evidenceRequirementView(params: {
  episodeState: SicknessEpisodeState;
  requiredFromDay: number | null;
  requirementDate: string | null;
  todayIso: string;
  sicknessEndedDateIso: string | null;
}): EvidenceRequirementView {
  if (params.requiredFromDay == null || !params.requirementDate) {
    return { kind: "inactive" };
  }
  const base = {
    requiredFromDay: params.requiredFromDay,
    requirementDate: params.requirementDate,
  };
  if (params.episodeState === "NOT_CONFIRMED") {
    return { kind: "confirmation_needed", ...base };
  }
  const reached =
    params.episodeState === "ENDED"
      ? Boolean(
          params.sicknessEndedDateIso &&
            params.sicknessEndedDateIso >= params.requirementDate,
        )
      : params.todayIso >= params.requirementDate;
  return reached
    ? { kind: "reached", ...base }
    : { kind: "not_reached", ...base };
}

export function inclusiveEndedDays(
  dayOneIso: string,
  endedIso: string,
): number | null {
  const start = parseLocalDate(dayOneIso);
  const end = parseLocalDate(endedIso);
  if (!start || !end || end.getTime() < start.getTime()) {
    return null;
  }
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}
