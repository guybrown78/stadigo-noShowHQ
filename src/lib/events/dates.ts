const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function londonTodayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Calendar date stored as UTC midnight so @db.Date does not shift. */
export function parseLocalDate(value: string): Date | null {
  const match = value.trim().match(DATE_PATTERN);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

export function formatLocalDateIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const DISPLAY_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sept",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Calendar dates stored as UTC midnight. Avoid Intl month names: Node and Chrome disagree on en-GB “Sept” vs “Sep”. */
export function formatLocalDateDisplay(date: Date): string {
  return `${date.getUTCDate()} ${DISPLAY_MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function parseLocalTime(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const match = trimmed.match(TIME_PATTERN);
  if (!match) {
    return null;
  }
  return `${match[1]}:${match[2]}`;
}

export const TIME_INTERVAL_MINUTES = 5;

export function steppedMinuteOptions(): string[] {
  const steps = 60 / TIME_INTERVAL_MINUTES;
  return Array.from({ length: steps }, (_, index) =>
    String(index * TIME_INTERVAL_MINUTES).padStart(2, "0"),
  );
}

export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function isTimeBefore(left: string, right: string): boolean {
  return timeToMinutes(left) < timeToMinutes(right);
}

export function hourOptions(): string[] {
  return Array.from({ length: 24 }, (_, hour) =>
    String(hour).padStart(2, "0"),
  );
}

export function minuteOptions(...existingTimes: (string | null | undefined)[]): string[] {
  const minutes: string[] = steppedMinuteOptions();
  for (const time of existingTimes) {
    const minute = time?.split(":")[1];
    if (minute && !minutes.includes(minute)) {
      minutes.push(minute);
    }
  }
  return minutes.sort();
}

export function splitTime(value: string): { hour: string; minute: string } {
  const match = value.trim().match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    return { hour: "", minute: "" };
  }
  return { hour: match[1], minute: match[2] };
}

export function joinTime(hour: string, minute: string): string {
  if (!hour) {
    return "";
  }
  return `${hour}:${minute || "00"}`;
}

export function resolveOvernight(startTime: string | null, endTime: string | null) {
  if (!startTime || !endTime) {
    return { endsNextDay: false, valid: true as const };
  }
  if (startTime === endTime) {
    return { endsNextDay: false, valid: false as const };
  }
  if (timeToMinutes(endTime) < timeToMinutes(startTime)) {
    return { endsNextDay: true, valid: true as const };
  }
  return { endsNextDay: false, valid: true as const };
}

export function formatTimeRange(
  startTime: string | null,
  endTime: string | null,
  endsNextDay: boolean,
): string | null {
  if (!startTime && !endTime) {
    return null;
  }
  if (startTime && endTime) {
    return endsNextDay ? `${startTime}–${endTime} (+1 day)` : `${startTime}–${endTime}`;
  }
  return startTime ?? endTime;
}
