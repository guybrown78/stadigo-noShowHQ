import { formatLocalDateDisplay, formatLocalDateIso } from "@/lib/events/dates";

export const MISSED_SHIFT_ARCHIVED_MESSAGE =
  "Archived sickness records cannot have shifts added or removed.";
export const MISSED_SHIFT_UNSUPPORTED_MESSAGE =
  "Booked shifts can only be added to a sickness record.";
export const MISSED_SHIFT_DUPLICATE_MESSAGE =
  "This booked shift is already on this sickness record.";
export const MISSED_SHIFT_OTHER_SICKNESS_MESSAGE =
  "This booked shift is already recorded on another sickness record.";
export const MISSED_SHIFT_ABSENCE_CONFLICT_MESSAGE =
  "This booked shift is already recorded as a cancellation or AWOL.";
export const MISSED_SHIFT_BLOCKS_ABSENCE =
  "This event is already recorded as a missed shift on a sickness record.";
export const MISSED_SHIFT_NOT_FOUND_MESSAGE =
  "This shift is no longer on the record. Reload and try again.";
export const MISSED_SHIFT_EVENT_MESSAGE = "Select a booked shift.";
export const MISSED_SHIFT_STAFF_CONFLICT_MESSAGE =
  "A booked shift on this record is already in use for the selected staff member.";

export function missedShiftCountLabel(count: number): string {
  return count === 1 ? "1 missed shift" : `${count} missed shifts`;
}

export function missedShiftWhen(shift: {
  eventDateSnapshot: Date;
  eventStartTimeSnapshot: string | null;
}): string {
  const date = formatLocalDateDisplay(shift.eventDateSnapshot);
  return shift.eventStartTimeSnapshot
    ? `${date} · ${shift.eventStartTimeSnapshot}`
    : date;
}

export function missedShiftHistoryValue(shift: {
  eventNameSnapshot: string;
  eventDateSnapshot: Date;
}): string {
  return `${shift.eventNameSnapshot} · ${formatLocalDateIso(shift.eventDateSnapshot)}`;
}
