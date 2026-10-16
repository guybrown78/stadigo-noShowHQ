import { formatLocalDateIso, parseLocalDate } from "@/lib/events/dates";

export const DEFAULT_PAY_PERIOD_START_DAY = 1;
export const DEFAULT_CANCELLATION_THRESHOLD = 3;
export const DEFAULT_AWOL_THRESHOLD_COUNT = 3;
export const DEFAULT_AWOL_WINDOW_DAYS = 30;
export const DEFAULT_SHORT_NOTICE_HOURS = 24;

export function clampPayPeriodStartDay(day: number): number {
  if (!Number.isInteger(day) || day < 1) {
    return DEFAULT_PAY_PERIOD_START_DAY;
  }
  return Math.min(day, 28);
}

export function payPeriodContaining(
  todayIso: string,
  startDay: number,
): { fromIso: string; toIso: string } {
  const start = clampPayPeriodStartDay(startDay);
  const today = parseLocalDate(todayIso);
  if (!today) {
    throw new Error("Invalid date");
  }
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const day = today.getUTCDate();
  const from =
    day >= start
      ? new Date(Date.UTC(year, month, start))
      : new Date(Date.UTC(year, month - 1, start));
  const nextStart = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, start),
  );
  const to = new Date(nextStart.getTime() - 86_400_000);
  return {
    fromIso: formatLocalDateIso(from),
    toIso: formatLocalDateIso(to),
  };
}

export function previousPayPeriod(
  todayIso: string,
  startDay: number,
): { fromIso: string; toIso: string } {
  const current = payPeriodContaining(todayIso, startDay);
  const from = parseLocalDate(current.fromIso);
  if (!from) {
    throw new Error("Invalid date");
  }
  const dayBefore = new Date(from.getTime() - 86_400_000);
  return payPeriodContaining(formatLocalDateIso(dayBefore), startDay);
}
