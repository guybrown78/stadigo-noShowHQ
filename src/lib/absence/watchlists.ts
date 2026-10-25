import type { EmploymentStatus, PrismaClient } from "@prisma/client";
import { formatLocalDateIso, parseLocalDate } from "@/lib/events/dates";
import { addCalendarDays } from "@/lib/staff/probation";
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

export type WatchPeriod = {
  id: string;
  number: number;
  label: string;
  fromIso: string;
  toIso: string;
};

async function cancellationCountsForPeriod(
  db: Db,
  tenantId: string,
  payPeriodId: string,
): Promise<Map<string, number>> {
  const rows = await db.absence.groupBy({
    by: ["staffId"],
    where: {
      tenantId,
      type: "CANCELLATION",
      recordStatus: "ACTIVE",
      payPeriodId,
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
  settings: { cancellationThreshold: number },
): Promise<{
  current: WatchStaff[];
  repeated: WatchStaff[];
  openPeriod: WatchPeriod | null;
  previousPeriod: WatchPeriod | null;
}> {
  const periods = await db.payPeriod.findMany({
    where: { tenantId },
    orderBy: { number: "desc" },
  });
  const open = periods.find((period) => period.status === "OPEN") ?? null;
  if (!open) {
    return {
      current: [],
      repeated: [],
      openPeriod: null,
      previousPeriod: null,
    };
  }
  const previous =
    periods
      .filter((period) => period.status === "CLOSED" && period.number < open.number)
      .sort((left, right) => right.number - left.number)[0] ?? null;
  const [currentCounts, previousCounts] = await Promise.all([
    cancellationCountsForPeriod(db, tenantId, open.id),
    previous
      ? cancellationCountsForPeriod(db, tenantId, previous.id)
      : Promise.resolve(new Map<string, number>()),
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
  return {
    current,
    repeated,
    openPeriod: toWatchPeriod(open),
    previousPeriod: previous ? toWatchPeriod(previous) : null,
  };
}

function toWatchPeriod(period: {
  id: string;
  number: number;
  label: string;
  startsOn: Date;
  endsOn: Date;
}): WatchPeriod {
  return {
    id: period.id,
    number: period.number,
    label: period.label,
    fromIso: formatLocalDateIso(period.startsOn),
    toIso: formatLocalDateIso(period.endsOn),
  };
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
