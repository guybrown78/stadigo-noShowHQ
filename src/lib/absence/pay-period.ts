import { formatLocalDateIso, parseLocalDate } from "@/lib/events/dates";

export const DEFAULT_CANCELLATION_THRESHOLD = 3;
export const DEFAULT_AWOL_THRESHOLD_COUNT = 3;
export const DEFAULT_AWOL_WINDOW_DAYS = 30;
export const DEFAULT_SHORT_NOTICE_HOURS = 24;

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export function payPeriodLabel(startsOnIso: string, endsOnIso: string): string | null {
  const start = parseLocalDate(startsOnIso);
  const end = parseLocalDate(endsOnIso);
  if (!start || !end || startsOnIso > endsOnIso) {
    return null;
  }
  if (isFullCalendarMonth(start, end)) {
    return `${MONTHS[start.getUTCMonth()]} ${start.getUTCFullYear()}`;
  }
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (days === 7) {
    return `Week ending ${dayMonthYear(end)}`;
  }
  return `${dayMonthYear(start)} to ${dayMonthYear(end)}`;
}

export const PAY_PERIOD_LENGTHS = [
  { id: "7", label: "7 days" },
  { id: "14", label: "2 weeks" },
  { id: "28", label: "4 weeks" },
  { id: "month", label: "1 month" },
] as const;

export type PayPeriodLengthId = (typeof PAY_PERIOD_LENGTHS)[number]["id"];

/** Inclusive end date for a length that begins on startsOnIso. */
export function payPeriodEndOn(
  startsOnIso: string,
  length: PayPeriodLengthId,
): string | null {
  const start = parseLocalDate(startsOnIso);
  if (!start) return null;
  if (length === "month") {
    const nextMonth = addUtcMonths(start, 1);
    nextMonth.setUTCDate(nextMonth.getUTCDate() - 1);
    return formatLocalDateIso(nextMonth);
  }
  const extraDays = length === "7" ? 6 : length === "14" ? 13 : 27;
  const end = new Date(start.getTime());
  end.setUTCDate(end.getUTCDate() + extraDays);
  return formatLocalDateIso(end);
}

function addUtcMonths(date: Date, months: number): Date {
  const day = date.getUTCDate();
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return target;
}

export function formatPayPeriodName(period: {
  number: number;
  label: string;
}): string {
  return `${period.number} · ${period.label}`;
}

export type PayPeriodLifecycle = "OPEN" | "SCHEDULED" | "CLOSED";

export function payPeriodStatusSuffix(
  period: { id: string; status: PayPeriodLifecycle; startsOn?: string },
  periods: { id: string; status?: PayPeriodLifecycle; startsOn?: string }[] = [],
): string {
  if (period.status === "OPEN") return " (current)";
  if (period.status !== "SCHEDULED") return "";
  const scheduled = periods.filter((item) => item.status === "SCHEDULED");
  const next = [...scheduled].sort((left, right) =>
    (left.startsOn ?? "").localeCompare(right.startsOn ?? ""),
  )[0];
  return !next || next.id === period.id ? " (next)" : "";
}

export function rangesOverlap(
  left: { startsOnIso: string; endsOnIso: string },
  right: { startsOnIso: string; endsOnIso: string },
): boolean {
  return left.startsOnIso <= right.endsOnIso && right.startsOnIso <= left.endsOnIso;
}

function isFullCalendarMonth(start: Date, end: Date): boolean {
  if (start.getUTCDate() !== 1) {
    return false;
  }
  if (
    start.getUTCFullYear() !== end.getUTCFullYear() ||
    start.getUTCMonth() !== end.getUTCMonth()
  ) {
    return false;
  }
  const lastDay = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return end.getUTCDate() === lastDay;
}

function dayMonthYear(date: Date): string {
  return `${date.getUTCDate()} ${SHORT_MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}
