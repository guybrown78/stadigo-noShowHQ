import { prisma } from "@/lib/db";

export const ACTIVITY_THROTTLE_MS = 5 * 60 * 1000;

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

export function shouldTouchLastActiveAt(
  lastActiveAt: Date | null,
  now = new Date(),
  throttleMs = ACTIVITY_THROTTLE_MS,
): boolean {
  if (!lastActiveAt) {
    return true;
  }
  return now.getTime() - lastActiveAt.getTime() >= throttleMs;
}

export async function recordUserLogin(userId: string, at = new Date()) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      lastLoggedInAt: at,
      lastActiveAt: at,
    },
  });
}

export async function touchLastActiveAt(
  userId: string,
  lastActiveAt: Date | null,
  now = new Date(),
) {
  if (!shouldTouchLastActiveAt(lastActiveAt, now)) {
    return;
  }

  await prisma.user.update({
    where: { id: userId },
    data: { lastActiveAt: now },
  });
}

export function formatDateTimeDisplay(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  const month = DISPLAY_MONTHS[Number(value("month")) - 1];
  return `${Number(value("day"))} ${month} ${value("year")}, ${value("hour")}:${value("minute")}`;
}

export function formatAdminTimestamp(date: Date | null | undefined): string {
  return date ? formatDateTimeDisplay(date) : "Never";
}
