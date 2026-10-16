import type { EmploymentStatus, PrismaClient } from "@prisma/client";
import { formatLocalDateIso, parseLocalDate } from "@/lib/events/dates";
import { addCalendarDays } from "@/lib/staff/probation";
import {
  payPeriodContaining,
  previousPayPeriod,
} from "@/lib/absence/pay-period";
import { EMPLOYMENT_STATUSES } from "@/lib/staff/catalog";

type Db = PrismaClient;

export type WorkforceCount = {
  status: EmploymentStatus;
  count: number;
};

const WATCH_STATUSES: EmploymentStatus[] = [
  "MONITORING",
  "LONG_TERM_SICK",
  "CONTACT_REQUIRED",
  "DISABLED",
  "INACTIVE",
];

export async function countWorkforceStatuses(
  db: Db,
  tenantId: string,
): Promise<WorkforceCount[]> {
  const rows = await db.staff.groupBy({
    by: ["employmentStatus"],
    where: { tenantId, deletedAt: null },
    _count: { _all: true },
  });
  const counts = new Map(
    rows.map((row) => [row.employmentStatus, row._count._all]),
  );
  return EMPLOYMENT_STATUSES.filter((status) =>
    WATCH_STATUSES.includes(status),
  ).map((status) => ({
    status,
    count: counts.get(status) ?? 0,
  }));
}

export type WatchStaff = {
  staffId: string;
  staffIdNumber: string;
  firstName: string;
  lastName: string;
  count: number;
};

async function cancellationCounts(
  db: Db,
  tenantId: string,
  fromIso: string,
  toIso: string,
): Promise<Map<string, number>> {
  const from = parseLocalDate(fromIso);
  const to = parseLocalDate(toIso);
  if (!from || !to) {
    return new Map();
  }
  const rows = await db.absence.groupBy({
    by: ["staffId"],
    where: {
      tenantId,
      type: "CANCELLATION",
      recordStatus: "ACTIVE",
      reportedDate: { gte: from, lte: to },
    },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.staffId, row._count._all]));
}

async function nameRows(
  db: Db,
  tenantId: string,
  counts: Map<string, number>,
): Promise<WatchStaff[]> {
  if (counts.size === 0) {
    return [];
  }
  const staff = await db.staff.findMany({
    where: { tenantId, id: { in: [...counts.keys()] }, deletedAt: null },
    select: {
      id: true,
      staffIdNumber: true,
      firstName: true,
      lastName: true,
    },
  });
  return staff
    .map((person) => ({
      staffId: person.id,
      staffIdNumber: person.staffIdNumber,
      firstName: person.firstName,
      lastName: person.lastName,
      count: counts.get(person.id) ?? 0,
    }))
    .sort((a, b) => b.count - a.count || a.lastName.localeCompare(b.lastName));
}

export async function cancellationWatchlists(
  db: Db,
  tenantId: string,
  todayIso: string,
  settings: { payPeriodStartDay: number; cancellationThreshold: number },
): Promise<{
  current: WatchStaff[];
  repeated: WatchStaff[];
  currentPeriod: { fromIso: string; toIso: string };
  previousPeriod: { fromIso: string; toIso: string };
}> {
  const currentPeriod = payPeriodContaining(todayIso, settings.payPeriodStartDay);
  const previous = previousPayPeriod(todayIso, settings.payPeriodStartDay);
  const [currentCounts, previousCounts] = await Promise.all([
    cancellationCounts(db, tenantId, currentPeriod.fromIso, currentPeriod.toIso),
    cancellationCounts(db, tenantId, previous.fromIso, previous.toIso),
  ]);
  const threshold = settings.cancellationThreshold;
  const currentIds = new Map(
    [...currentCounts].filter(([, count]) => count >= threshold),
  );
  const repeatedIds = new Map(
    [...currentIds].filter(([staffId]) => (previousCounts.get(staffId) ?? 0) >= threshold),
  );
  const [current, repeated] = await Promise.all([
    nameRows(db, tenantId, currentIds),
    nameRows(db, tenantId, repeatedIds),
  ]);
  return { current, repeated, currentPeriod, previousPeriod: previous };
}

export async function awolWatchlist(
  db: Db,
  tenantId: string,
  todayIso: string,
  settings: { awolThresholdCount: number; awolWindowDays: number },
): Promise<{
  rows: WatchStaff[];
  fromIso: string;
  toIso: string;
}> {
  const today = parseLocalDate(todayIso);
  if (!today) {
    return { rows: [], fromIso: todayIso, toIso: todayIso };
  }
  const span = Math.max(1, settings.awolWindowDays);
  const from = addCalendarDays(today, -(span - 1));
  const fromIso = formatLocalDateIso(from);
  const toIso = formatLocalDateIso(today);
  const rows = await db.absence.groupBy({
    by: ["staffId"],
    where: {
      tenantId,
      type: "AWOL",
      recordStatus: "ACTIVE",
      awol: { eventDateSnapshot: { gte: from, lte: today } },
    },
    _count: { _all: true },
  });
  const counts = new Map(
    rows
      .filter((row) => row._count._all >= settings.awolThresholdCount)
      .map((row) => [row.staffId, row._count._all]),
  );
  return {
    rows: await nameRows(db, tenantId, counts),
    fromIso,
    toIso,
  };
}
