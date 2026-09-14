import { DEFAULT_TENANT_TIMEZONE } from "@/lib/absence/catalog";

export const TENANT_TIMEZONE_ERROR =
  "This organisation's timezone is missing or invalid. Ask a platform administrator to set a valid IANA timezone before recording AWOL.";

export function isValidIanaTimeZone(timeZone: string): boolean {
  const trimmed = timeZone.trim();
  if (!trimmed) {
    return false;
  }
  try {
    Intl.DateTimeFormat("en-US", { timeZone: trimmed });
    return true;
  } catch {
    return false;
  }
}

export function requireIanaTimeZone(timeZone: string | null | undefined): string {
  if (!timeZone || !isValidIanaTimeZone(timeZone)) {
    throw new TenantTimezoneError();
  }
  return timeZone.trim();
}

export class TenantTimezoneError extends Error {
  constructor(message = TENANT_TIMEZONE_ERROR) {
    super(message);
    this.name = "TenantTimezoneError";
  }
}

export function todayIsoInTimeZone(
  timeZone: string,
  now: Date = new Date(),
): string {
  const valid = requireIanaTimeZone(timeZone);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: valid,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function timeHHmmInTimeZone(
  timeZone: string,
  now: Date = new Date(),
): string {
  const valid = requireIanaTimeZone(timeZone);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: valid,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.hour ?? "00"}:${parts.minute ?? "00"}`;
}

export function defaultTenantTimezone(): string {
  return DEFAULT_TENANT_TIMEZONE;
}

function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(instant)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - instant.getTime();
}

/** Convert a tenant-local wall-clock date+time to a UTC instant. */
export function wallClockToUtc(
  dateIso: string,
  timeHHmm: string,
  timeZone: string,
): Date {
  const valid = requireIanaTimeZone(timeZone);
  const [year, month, day] = dateIso.split("-").map(Number);
  const [hour, minute] = timeHHmm.split(":").map(Number);
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offsetMs = timeZoneOffsetMs(new Date(utcGuess), valid);
  let result = utcGuess - offsetMs;
  const adjustedOffset = timeZoneOffsetMs(new Date(result), valid);
  if (adjustedOffset !== offsetMs) {
    result = utcGuess - adjustedOffset;
  }
  return new Date(result);
}
