import { parseLocalDate } from "@/lib/events/dates";

export function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function cellToDisplayString(value: unknown, asDate = false, asTime = false): string {
  if (value == null || value === "") {
    return "";
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    if (asDate) {
      return excelSerialToIsoDate(value);
    }
    if (asTime) {
      return excelFractionToTime(value);
    }
    if (Number.isInteger(value)) {
      return String(value);
    }
    return String(value);
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    if (asTime && !asDate) {
      return `${pad2(value.getUTCHours())}:${pad2(value.getUTCMinutes())}`;
    }
    return formatJsDateToIso(value);
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if ("result" in record) {
      return cellToDisplayString(record.result, asDate, asTime);
    }
    if ("richText" in record && Array.isArray(record.richText)) {
      return record.richText
        .map((part) =>
          typeof part === "object" && part && "text" in part
            ? String((part as { text: unknown }).text ?? "")
            : "",
        )
        .join("");
    }
    if (typeof record.text === "string") {
      return record.text;
    }
    if ("error" in record) {
      return "";
    }
    if ("formula" in record && record.result === undefined) {
      return "";
    }
  }
  return String(value).trim();
}

export function formatJsDateToIso(value: Date): string {
  const utcMidnight =
    value.getUTCHours() === 0 &&
    value.getUTCMinutes() === 0 &&
    value.getUTCSeconds() === 0;
  const year = utcMidnight ? value.getUTCFullYear() : value.getFullYear();
  const month = utcMidnight ? value.getUTCMonth() + 1 : value.getMonth() + 1;
  const day = utcMidnight ? value.getUTCDate() : value.getDate();
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function excelSerialToIsoDate(serial: number): string {
  const whole = Math.trunc(serial);
  const utc = Date.UTC(1899, 11, 30) + whole * 86_400_000;
  const date = new Date(utc);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

export function excelFractionToTime(value: number): string {
  const fraction = value % 1;
  const totalMinutes = Math.round(Math.abs(fraction) * 24 * 60) % (24 * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${pad2(hours)}:${pad2(minutes)}`;
}

export function coerceEventDate(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (parseLocalDate(trimmed)) {
    return trimmed;
  }
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric) && numeric > 20000 && numeric < 80000) {
    return excelSerialToIsoDate(numeric);
  }
  return trimmed;
}

export function coerceTime(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric) && numeric >= 0 && numeric < 1) {
    return excelFractionToTime(numeric);
  }
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (match) {
    return `${pad2(Number(match[1]))}:${match[2]}`;
  }
  return trimmed;
}

export function escapeSpreadsheetCell(value: string): string {
  if (/^[=+\-@\t\r]/.test(value)) {
    return `'${value}`;
  }
  return value;
}
