import { Prisma, type PrismaClient } from "@prisma/client";
import type { DashboardBucket } from "@/lib/absence/dashboard-range";
import { formatLocalDateIso, parseLocalDate } from "@/lib/events/dates";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type DashboardTypeCounts = {
  CANCELLATION: number;
  AWOL: number;
  SICKNESS: number;
};

export type DashboardRepeatRow = {
  staffId: string;
  firstName: string;
  lastName: string;
  roleTitle: string;
  cancellation: number;
  awol: number;
  sickness: number;
  total: number;
};

export type DashboardTrendBucket = DashboardBucket & DashboardTypeCounts;

export type DashboardVenueRow = {
  venueId: string | null;
  name: string;
  cancellation: number;
  awol: number;
  total: number;
};

export type DashboardEventRow = {
  eventId: string;
  name: string;
  eventDateIso: string;
  cancellation: number;
  awol: number;
  total: number;
};

export type DashboardEventOption = {
  id: string;
  name: string;
  reference: string | null;
  eventDateIso: string;
};

export type AbsenceDashboard = {
  current: DashboardTypeCounts;
  previous: DashboardTypeCounts;
  repeats: DashboardRepeatRow[];
  trend: DashboardTrendBucket[];
  venues: DashboardVenueRow[];
  events: DashboardEventRow[];
};

type AbsenceFact = {
  type: "CANCELLATION" | "AWOL" | "SICKNESS";
  staffId: string;
  eventId: string | null;
  firstName: string;
  lastName: string;
  roleTitle: string;
  affectedIso: string;
  venueId: string | null;
  venueName: string | null;
  eventName: string | null;
};

type FactRow = {
  type: string;
  staffId: string;
  eventId: string | null;
  firstName: string;
  lastName: string;
  roleTitle: string;
  affectedDate: Date | string;
  venueId: string | null;
  venueName: string | null;
  eventName: string | null;
};

const NO_VENUE_LABEL = "No venue recorded";

export async function getAbsenceDashboard(
  db: DbClient,
  tenantId: string,
  input: {
    from: Date;
    to: Date;
    previousFrom: Date;
    previousTo: Date;
    buckets: DashboardBucket[];
    venueId: string | null;
    eventId: string | null;
  },
): Promise<AbsenceDashboard> {
  const spanFrom = input.previousFrom < input.from ? input.previousFrom : input.from;
  const spanTo = input.previousTo > input.to ? input.previousTo : input.to;
  const rows = await db.$queryRaw<FactRow[]>`
    SELECT
      a.type::text AS type,
      a."staffId" AS "staffId",
      a."eventId" AS "eventId",
      st."firstName" AS "firstName",
      st."lastName" AS "lastName",
      st."roleTitle" AS "roleTitle",
      COALESCE(
        c."eventDateSnapshot",
        w."eventDateSnapshot",
        s."firstWorkingDaySick"
      ) AS "affectedDate",
      COALESCE(c."venueIdSnapshot", w."venueIdSnapshot") AS "venueId",
      COALESCE(c."venueNameSnapshot", w."venueNameSnapshot") AS "venueName",
      COALESCE(c."eventNameSnapshot", w."eventNameSnapshot") AS "eventName"
    FROM "Absence" a
    INNER JOIN "Staff" st
      ON st.id = a."staffId"
      AND st."tenantId" = a."tenantId"
    LEFT JOIN "CancellationDetail" c ON c."absenceId" = a.id
    LEFT JOIN "AwolDetail" w ON w."absenceId" = a.id
    LEFT JOIN "SicknessDetail" s ON s."absenceId" = a.id
    WHERE a."tenantId" = ${tenantId}
      AND a."recordStatus" = 'ACTIVE'
      AND (
        (a.type = 'CANCELLATION' AND c."absenceId" IS NOT NULL)
        OR (a.type = 'AWOL' AND w."absenceId" IS NOT NULL)
        OR (a.type = 'SICKNESS' AND s."absenceId" IS NOT NULL)
      )
      AND COALESCE(
        c."eventDateSnapshot",
        w."eventDateSnapshot",
        s."firstWorkingDaySick"
      ) >= ${spanFrom}
      AND COALESCE(
        c."eventDateSnapshot",
        w."eventDateSnapshot",
        s."firstWorkingDaySick"
      ) <= ${spanTo}
  `;

  return summariseAbsenceFacts(
    rows.flatMap((row) => {
      const fact = toFact(row);
      return fact ? [fact] : [];
    }),
    input,
  );
}

export async function listDashboardEventOptions(
  db: DbClient,
  tenantId: string,
  from: Date,
  to: Date,
  selectedEventId: string,
): Promise<DashboardEventOption[]> {
  const events = await db.event.findMany({
    where: {
      tenantId,
      deletedAt: null,
      eventDate: { gte: from, lte: to },
    },
    select: { id: true, name: true, reference: true, eventDate: true },
    orderBy: [{ eventDate: "asc" }, { name: "asc" }],
  });
  const options = events.map(toEventOption);
  if (selectedEventId && !options.some((option) => option.id === selectedEventId)) {
    const selected = await db.event.findFirst({
      where: { id: selectedEventId, tenantId },
      select: { id: true, name: true, reference: true, eventDate: true },
    });
    if (selected) {
      options.unshift(toEventOption(selected));
    }
  }
  return options;
}

export function summariseAbsenceFacts(
  facts: AbsenceFact[],
  input: {
    from: Date;
    to: Date;
    previousFrom: Date;
    previousTo: Date;
    buckets: DashboardBucket[];
    venueId: string | null;
    eventId: string | null;
  },
): AbsenceDashboard {
  const fromIso = formatLocalDateIso(input.from);
  const toIso = formatLocalDateIso(input.to);
  const previousFromIso = formatLocalDateIso(input.previousFrom);
  const previousToIso = formatLocalDateIso(input.previousTo);
  const currentFacts = facts.filter((fact) =>
    included(fact, fromIso, toIso, input.venueId, input.eventId),
  );
  const previousFacts = facts.filter((fact) =>
    included(fact, previousFromIso, previousToIso, input.venueId, input.eventId),
  );

  return {
    current: countTypes(currentFacts),
    previous: countTypes(previousFacts),
    repeats: repeatRows(currentFacts),
    trend: input.buckets.map((bucket) => ({
      ...bucket,
      ...countTypes(
        currentFacts.filter(
          (fact) => fact.affectedIso >= bucket.fromIso && fact.affectedIso <= bucket.toIso,
        ),
      ),
    })),
    venues: input.eventId ? [] : venueRows(currentFacts),
    events: eventRows(currentFacts),
  };
}

function included(
  fact: AbsenceFact,
  fromIso: string,
  toIso: string,
  venueId: string | null,
  eventId: string | null,
): boolean {
  if (fact.affectedIso < fromIso || fact.affectedIso > toIso) {
    return false;
  }
  if (fact.type === "SICKNESS") {
    return true;
  }
  if (venueId && fact.venueId !== venueId) {
    return false;
  }
  if (eventId && fact.eventId !== eventId) {
    return false;
  }
  return true;
}

function countTypes(facts: AbsenceFact[]): DashboardTypeCounts {
  const counts: DashboardTypeCounts = { CANCELLATION: 0, AWOL: 0, SICKNESS: 0 };
  for (const fact of facts) {
    counts[fact.type] += 1;
  }
  return counts;
}

function repeatRows(facts: AbsenceFact[]): DashboardRepeatRow[] {
  const byStaff = new Map<string, DashboardRepeatRow>();
  for (const fact of facts) {
    const row = byStaff.get(fact.staffId) ?? {
      staffId: fact.staffId,
      firstName: fact.firstName,
      lastName: fact.lastName,
      roleTitle: fact.roleTitle,
      cancellation: 0,
      awol: 0,
      sickness: 0,
      total: 0,
    };
    if (fact.type === "CANCELLATION") row.cancellation += 1;
    if (fact.type === "AWOL") row.awol += 1;
    if (fact.type === "SICKNESS") row.sickness += 1;
    row.total += 1;
    byStaff.set(fact.staffId, row);
  }
  return [...byStaff.values()]
    .filter((row) => row.total >= 2)
    .sort((left, right) => {
      if (right.total !== left.total) return right.total - left.total;
      const last = left.lastName.localeCompare(right.lastName, "en");
      if (last !== 0) return last;
      const first = left.firstName.localeCompare(right.firstName, "en");
      if (first !== 0) return first;
      return left.staffId.localeCompare(right.staffId);
    });
}

function venueRows(facts: AbsenceFact[]): DashboardVenueRow[] {
  const byVenue = new Map<string, DashboardVenueRow>();
  for (const fact of facts) {
    if (fact.type === "SICKNESS") continue;
    const key = fact.venueId ?? "";
    const row = byVenue.get(key) ?? {
      venueId: fact.venueId,
      name: fact.venueName?.trim() || NO_VENUE_LABEL,
      cancellation: 0,
      awol: 0,
      total: 0,
    };
    if (fact.type === "CANCELLATION") row.cancellation += 1;
    if (fact.type === "AWOL") row.awol += 1;
    row.total += 1;
    byVenue.set(key, row);
  }
  return [...byVenue.values()]
    .filter((row) => row.total > 0)
    .sort((left, right) => {
      if (right.total !== left.total) return right.total - left.total;
      return left.name.localeCompare(right.name, "en");
    });
}

function eventRows(facts: AbsenceFact[]): DashboardEventRow[] {
  const byEvent = new Map<string, DashboardEventRow>();
  for (const fact of facts) {
    if (fact.type === "SICKNESS" || !fact.eventId) continue;
    const row = byEvent.get(fact.eventId) ?? {
      eventId: fact.eventId,
      name: fact.eventName?.trim() || "Event",
      eventDateIso: fact.affectedIso,
      cancellation: 0,
      awol: 0,
      total: 0,
    };
    if (fact.type === "CANCELLATION") row.cancellation += 1;
    if (fact.type === "AWOL") row.awol += 1;
    row.total += 1;
    byEvent.set(fact.eventId, row);
  }
  return [...byEvent.values()]
    .filter((row) => row.total > 0)
    .sort((left, right) => {
      if (right.total !== left.total) return right.total - left.total;
      if (right.eventDateIso !== left.eventDateIso) {
        return right.eventDateIso.localeCompare(left.eventDateIso);
      }
      const name = left.name.localeCompare(right.name, "en");
      if (name !== 0) return name;
      return left.eventId.localeCompare(right.eventId);
    });
}

function toFact(row: FactRow): AbsenceFact | null {
  if (row.type !== "CANCELLATION" && row.type !== "AWOL" && row.type !== "SICKNESS") {
    return null;
  }
  const affectedIso = asIsoDate(row.affectedDate);
  if (!affectedIso) return null;
  return {
    type: row.type,
    staffId: row.staffId,
    eventId: row.eventId,
    firstName: row.firstName,
    lastName: row.lastName,
    roleTitle: row.roleTitle,
    affectedIso,
    venueId: row.venueId,
    venueName: row.venueName,
    eventName: row.eventName,
  };
}

function asIsoDate(value: Date | string): string {
  if (value instanceof Date) {
    return formatLocalDateIso(value);
  }
  if (typeof value === "string") {
    const parsed = parseLocalDate(value.slice(0, 10));
    return parsed ? formatLocalDateIso(parsed) : "";
  }
  return "";
}

function toEventOption(event: {
  id: string;
  name: string;
  reference: string | null;
  eventDate: Date;
}): DashboardEventOption {
  return {
    id: event.id,
    name: event.name,
    reference: event.reference,
    eventDateIso: formatLocalDateIso(event.eventDate),
  };
}
