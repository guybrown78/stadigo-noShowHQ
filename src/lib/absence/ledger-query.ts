import { Prisma, type PrismaClient } from "@prisma/client";
import {
  LEDGER_PAGE_SIZE,
  defaultLedgerSortForView,
  isLedgerSortAllowed,
  ledgerAbsenceTypesForView,
  ledgerFilterApplies,
  type LedgerSortDirection,
  type LedgerSortField,
  type LedgerView,
} from "@/lib/absence/catalog";
import {
  isLedgerAffectedDateRangeInvalid,
  isLedgerDateRangeInvalid,
  resolvedLedgerAffectedFrom,
  resolvedLedgerAffectedTo,
  type LedgerListQuery,
} from "@/lib/absence/schema";
import { parseLocalDate } from "@/lib/events/dates";

type DbClient = PrismaClient | Prisma.TransactionClient;

export const UNSPECIFIED_EVENT_TYPE_FILTER = "__unspecified__";

export type LedgerFilterOptions = {
  venues: { id: string; name: string }[];
  eventTypes: { id: string; name: string }[];
};

export type AwolLedgerFilterOptions = LedgerFilterOptions;

const ledgerListSelect = {
  id: true,
  type: true,
  recordStatus: true,
  reportedDate: true,
  reportedTime: true,
  createdAt: true,
  firstWorkingDaySick: true,
  staff: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      staffIdNumber: true,
      deletedAt: true,
    },
  },
  event: {
    select: {
      id: true,
      reference: true,
      deletedAt: true,
    },
  },
  cancellation: {
    select: {
      eventNameSnapshot: true,
      eventDateSnapshot: true,
      venueIdSnapshot: true,
      venueNameSnapshot: true,
      noticeMinutes: true,
      noticeCalendarDays: true,
      noticeBasis: true,
      isShortNotice: true,
    },
  },
  awol: {
    select: {
      eventNameSnapshot: true,
      eventReferenceSnapshot: true,
      eventDateSnapshot: true,
      venueIdSnapshot: true,
      venueNameSnapshot: true,
      eventTypeSnapshot: true,
    },
  },
  sickness: {
    select: {
      firstWorkingDaySick: true,
      sicknessStartedDate: true,
      sicknessEndedDate: true,
      episodeState: true,
      staffFirstNameSnapshot: true,
      staffLastNameSnapshot: true,
      staffIdNumberSnapshot: true,
    },
  },
} satisfies Prisma.AbsenceSelect;

type LedgerSelectRow = Prisma.AbsenceGetPayload<{
  select: typeof ledgerListSelect;
}>;

export type LedgerAbsenceRow = LedgerSelectRow & {
  recordedDate: Date;
  affectedDate: Date | null;
  issueSummaryPresent: boolean;
};

export type LedgerCancellationRow = LedgerAbsenceRow;
export type LedgerAwolRow = LedgerAbsenceRow;
export type LedgerSicknessRow = LedgerAbsenceRow;

export type LedgerTypeCounts = {
  CANCELLATION: number;
  AWOL: number;
  SICKNESS: number;
};

export type LedgerListResult = {
  rows: LedgerAbsenceRow[];
  total: number;
  activeTotal: number;
  activeTypeCounts: LedgerTypeCounts;
  matchingTypeCounts: LedgerTypeCounts;
  page: number;
  pageCount: number;
};

function sqlDirection(direction: LedgerSortDirection) {
  return direction === "asc" ? Prisma.raw("ASC") : Prisma.raw("DESC");
}

function ledgerFromSql() {
  return Prisma.sql`
    FROM "Absence" a
    LEFT JOIN "Staff" st ON st.id = a."staffId"
    LEFT JOIN "Event" e ON e.id = a."eventId"
    LEFT JOIN "CancellationDetail" c ON c."absenceId" = a.id
    LEFT JOIN "AwolDetail" w ON w."absenceId" = a.id
    LEFT JOIN "SicknessDetail" s ON s."absenceId" = a.id
  `;
}

function ledgerTypeSql(view: LedgerView) {
  const types = [...ledgerAbsenceTypesForView(view)].map((type) =>
    Prisma.raw(`'${type}'::"AbsenceType"`),
  );
  return Prisma.sql`a.type IN (${Prisma.join(types)})`;
}

function ledgerSearchSql(search: string) {
  const trimmed = search.trim();
  if (!trimmed) {
    return Prisma.empty;
  }
  const pattern = `%${trimmed}%`;
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  const fullName =
    tokens.length >= 2
      ? Prisma.sql`
          OR (
            st."firstName" ILIKE ${"%" + tokens[0] + "%"}
            AND st."lastName" ILIKE ${"%" + tokens.slice(1).join(" ") + "%"}
          )
          OR (
            s."staffFirstNameSnapshot" ILIKE ${"%" + tokens[0] + "%"}
            AND s."staffLastNameSnapshot" ILIKE ${"%" + tokens.slice(1).join(" ") + "%"}
          )
        `
      : Prisma.empty;

  return Prisma.sql`
    AND (
      st."firstName" ILIKE ${pattern}
      OR st."lastName" ILIKE ${pattern}
      OR st."staffIdNumber" ILIKE ${pattern}
      OR s."staffFirstNameSnapshot" ILIKE ${pattern}
      OR s."staffLastNameSnapshot" ILIKE ${pattern}
      OR s."staffIdNumberSnapshot" ILIKE ${pattern}
      OR c."eventNameSnapshot" ILIKE ${pattern}
      OR COALESCE(e.reference, '') ILIKE ${pattern}
      OR w."eventNameSnapshot" ILIKE ${pattern}
      OR COALESCE(w."eventReferenceSnapshot", '') ILIKE ${pattern}
      ${fullName}
    )
  `;
}

function ledgerEventTypeSql(tenantId: string, query: LedgerListQuery) {
  if (!query.eventType) {
    return Prisma.empty;
  }
  if (query.eventType === UNSPECIFIED_EVENT_TYPE_FILTER) {
    return Prisma.sql`AND a.type = 'AWOL' AND w."eventTypeSnapshot" IS NULL`;
  }
  if (query.view === "awol") {
    return Prisma.sql`AND w."eventTypeSnapshot" = ${query.eventType}`;
  }
  return Prisma.sql`
    AND (
      e."eventTypeId" = ${query.eventType}
      OR w."eventTypeSnapshot" = (
        SELECT et.name
        FROM "EventType" et
        WHERE et.id = ${query.eventType}
          AND et."tenantId" = ${tenantId}
      )
    )
  `;
}

function ledgerWhereSql(
  tenantId: string,
  query: LedgerListQuery,
  options: { filters?: boolean; includeArchived?: boolean } = {},
) {
  const applyFilters = options.filters !== false;
  const includeArchived = Boolean(
    options.includeArchived ?? (applyFilters && query.includeArchived),
  );
  const skipReported =
    applyFilters && isLedgerDateRangeInvalid(query);
  const skipAffected =
    applyFilters && isLedgerAffectedDateRangeInvalid(query);
  const reportedFrom =
    applyFilters && !skipReported && query.reportedFrom
      ? parseLocalDate(query.reportedFrom)
      : null;
  const reportedTo =
    applyFilters && !skipReported && query.reportedTo
      ? parseLocalDate(query.reportedTo)
      : null;
  const affectedFromValue = resolvedLedgerAffectedFrom(query);
  const affectedToValue = resolvedLedgerAffectedTo(query);
  const affectedFrom =
    applyFilters && !skipAffected && affectedFromValue
      ? parseLocalDate(affectedFromValue)
      : null;
  const affectedTo =
    applyFilters && !skipAffected && affectedToValue
      ? parseLocalDate(affectedToValue)
      : null;
  const affectedExpr = Prisma.sql`COALESCE(c."eventDateSnapshot", w."eventDateSnapshot", s."firstWorkingDaySick", a."firstWorkingDaySick")`;

  return Prisma.sql`
    WHERE a."tenantId" = ${tenantId}
      AND ${ledgerTypeSql(query.view)}
      AND a."recordStatus" ${
        includeArchived
          ? Prisma.sql`IN ('ACTIVE', 'ARCHIVED')`
          : Prisma.sql`= 'ACTIVE'`
      }
      AND (
        (a.type = 'CANCELLATION' AND c."absenceId" IS NOT NULL)
        OR (a.type = 'AWOL' AND w."absenceId" IS NOT NULL)
        OR (a.type = 'SICKNESS' AND s."absenceId" IS NOT NULL)
      )
      ${
        reportedFrom
          ? Prisma.sql`AND a."reportedDate" >= ${reportedFrom}`
          : Prisma.empty
      }
      ${
        reportedTo
          ? Prisma.sql`AND a."reportedDate" <= ${reportedTo}`
          : Prisma.empty
      }
      ${
        affectedFrom
          ? Prisma.sql`AND ${affectedExpr} >= ${affectedFrom}`
          : Prisma.empty
      }
      ${
        affectedTo ? Prisma.sql`AND ${affectedExpr} <= ${affectedTo}` : Prisma.empty
      }
      ${
        applyFilters &&
        query.venue &&
        ledgerFilterApplies(query.view, "venue")
          ? Prisma.sql`AND (c."venueIdSnapshot" = ${query.venue} OR w."venueIdSnapshot" = ${query.venue})`
          : Prisma.empty
      }
      ${
        applyFilters && ledgerFilterApplies(query.view, "eventType")
          ? ledgerEventTypeSql(tenantId, query)
          : Prisma.empty
      }
      ${applyFilters ? ledgerSearchSql(query.q) : Prisma.empty}
  `;
}

function ledgerOrderSql(query: LedgerListQuery) {
  const sort = isLedgerSortAllowed(query.view, query.sort)
    ? query.sort
    : defaultLedgerSortForView(query.view);
  const direction = query.direction === "asc" ? "asc" : "desc";
  const dir = sqlDirection(direction);
  const recorded = Prisma.sql`a."reportedDate" ${dir}`;
  const affected = Prisma.sql`COALESCE(c."eventDateSnapshot", w."eventDateSnapshot", s."firstWorkingDaySick", a."firstWorkingDaySick") ${dir}`;
  const created = Prisma.sql`a."createdAt" ${dir}`;
  const idTie = Prisma.sql`a.id ${dir}`;
  const reportedTime = Prisma.sql`a."reportedTime" ${dir} NULLS LAST`;

  switch (sort as LedgerSortField) {
    case "type":
      return Prisma.sql`a.type ${dir}, ${recorded}, ${affected}, ${created}, ${idTie}`;
    case "staff":
      return Prisma.sql`
        COALESCE(s."staffLastNameSnapshot", st."lastName") ${dir},
        COALESCE(s."staffFirstNameSnapshot", st."firstName") ${dir},
        ${recorded}, ${affected}, ${created}, ${idTie}
      `;
    case "affected":
    case "eventDate":
    case "firstDay":
      return Prisma.sql`${affected}, ${recorded}, ${created}, ${idTie}`;
    case "event":
      return Prisma.sql`COALESCE(c."eventNameSnapshot", w."eventNameSnapshot") ${dir}, ${idTie}`;
    case "notice":
      return Prisma.sql`
        c."noticeCalendarDays" ${dir},
        c."noticeMinutes" ${dir} NULLS LAST,
        ${idTie}
      `;
    case "sicknessStarted":
      return Prisma.sql`
        s."sicknessStartedDate" ${dir} NULLS LAST,
        ${affected}, ${recorded}, ${created}, ${idTie}
      `;
    case "created":
      return Prisma.sql`${created}, ${idTie}`;
    case "reported":
    default:
      return Prisma.sql`${recorded}, ${reportedTime}, ${affected}, ${created}, ${idTie}`;
  }
}

function emptyTypeCounts(): LedgerTypeCounts {
  return { CANCELLATION: 0, AWOL: 0, SICKNESS: 0 };
}

function typeCountsFromRows(
  rows: Array<{ type: "CANCELLATION" | "AWOL" | "SICKNESS"; count: unknown }>,
): LedgerTypeCounts {
  const counts = emptyTypeCounts();
  for (const row of rows) {
    counts[row.type] = asCount(row.count);
  }
  return counts;
}

function asCount(value: unknown): number {
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    return Number(value);
  }
  return 0;
}

function ledgerAffectedDate(row: LedgerSelectRow): Date | null {
  return (
    row.cancellation?.eventDateSnapshot ??
    row.awol?.eventDateSnapshot ??
    row.sickness?.firstWorkingDaySick ??
    row.firstWorkingDaySick ??
    null
  );
}

function withLedgerProjection(
  rows: LedgerSelectRow[],
  presence: Map<string, boolean>,
): LedgerAbsenceRow[] {
  return rows.map((row) => ({
    ...row,
    recordedDate: row.reportedDate,
    affectedDate: ledgerAffectedDate(row),
    issueSummaryPresent: presence.get(row.id) ?? false,
  }));
}

async function sicknessIssueSummaryPresence(
  db: DbClient,
  tenantId: string,
  ids: string[],
): Promise<Map<string, boolean>> {
  if (ids.length === 0) {
    return new Map();
  }
  const rows = await db.$queryRaw<{ absenceId: string; present: boolean }[]>`
    SELECT s."absenceId",
      (s."issueSummary" IS NOT NULL AND btrim(s."issueSummary") <> '') AS present
    FROM "SicknessDetail" s
    WHERE s."tenantId" = ${tenantId}
      AND s."absenceId" IN (${Prisma.join(ids)})
  `;
  return new Map(rows.map((row) => [row.absenceId, Boolean(row.present)]));
}

export function ledgerStaffDisplay(row: LedgerAbsenceRow): {
  id: string;
  firstName: string;
  lastName: string;
  staffIdNumber: string;
  deletedAt: Date | null;
} {
  if (row.type === "SICKNESS" && row.sickness) {
    return {
      id: row.staff.id,
      firstName: row.sickness.staffFirstNameSnapshot,
      lastName: row.sickness.staffLastNameSnapshot,
      staffIdNumber: row.sickness.staffIdNumberSnapshot,
      deletedAt: row.staff.deletedAt,
    };
  }
  return row.staff;
}

export async function listLedgerFilterOptions(
  db: DbClient,
  tenantId: string,
): Promise<LedgerFilterOptions> {
  const [venues, eventTypes] = await Promise.all([
    db.venue.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.eventType.findMany({
      where: { tenantId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
  ]);
  return { venues, eventTypes };
}

export async function listAwolLedgerFilterOptions(
  db: DbClient,
  tenantId: string,
  includeArchived = false,
): Promise<AwolLedgerFilterOptions> {
  const rows = await db.awolDetail.findMany({
    where: {
      tenantId,
      absence: {
        type: "AWOL",
        recordStatus: includeArchived
          ? { in: ["ACTIVE", "ARCHIVED"] }
          : "ACTIVE",
      },
    },
    select: {
      venueIdSnapshot: true,
      venueNameSnapshot: true,
      eventTypeSnapshot: true,
    },
  });

  const venues = new Map<string, string>();
  const eventTypes = new Set<string>();
  let hasUnspecified = false;
  for (const row of rows) {
    if (row.venueIdSnapshot && row.venueNameSnapshot) {
      venues.set(row.venueIdSnapshot, row.venueNameSnapshot);
    }
    if (row.eventTypeSnapshot) {
      eventTypes.add(row.eventTypeSnapshot);
    } else {
      hasUnspecified = true;
    }
  }

  return {
    venues: [...venues.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    eventTypes: [
      ...[...eventTypes].sort((a, b) => a.localeCompare(b)).map((name) => ({
        id: name,
        name,
      })),
      ...(hasUnspecified
        ? [{ id: UNSPECIFIED_EVENT_TYPE_FILTER, name: "Unspecified" }]
        : []),
    ],
  };
}

export async function listAbsencesForLedger(
  db: PrismaClient,
  tenantId: string,
  query: LedgerListQuery,
): Promise<LedgerListResult> {
  const filteredWhere = ledgerWhereSql(tenantId, query);
  const activeWhere = ledgerWhereSql(tenantId, query, {
    filters: false,
    includeArchived: false,
  });
  const allActiveWhere = ledgerWhereSql(
    tenantId,
    { ...query, view: "all" },
    { filters: false, includeArchived: false },
  );

  const [totalRows, activeRows, typeRows, matchingTypeRows] = await Promise.all([
    db.$queryRaw<Array<{ total: unknown }>>`
      SELECT COUNT(*)::int AS total
      ${ledgerFromSql()}
      ${filteredWhere}
    `,
    db.$queryRaw<Array<{ total: unknown }>>`
      SELECT COUNT(*)::int AS total
      ${ledgerFromSql()}
      ${activeWhere}
    `,
    db.$queryRaw<Array<{ type: "CANCELLATION" | "AWOL" | "SICKNESS"; count: unknown }>>`
      SELECT a.type, COUNT(*)::int AS count
      ${ledgerFromSql()}
      ${allActiveWhere}
      GROUP BY a.type
    `,
    db.$queryRaw<Array<{ type: "CANCELLATION" | "AWOL" | "SICKNESS"; count: unknown }>>`
      SELECT a.type, COUNT(*)::int AS count
      ${ledgerFromSql()}
      ${filteredWhere}
      GROUP BY a.type
    `,
  ]);

  const total = asCount(totalRows[0]?.total);
  const activeTotal = asCount(activeRows[0]?.total);
  const activeTypeCounts = typeCountsFromRows(typeRows);
  const matchingTypeCounts = typeCountsFromRows(matchingTypeRows);

  const pageCount = Math.max(1, Math.ceil(total / LEDGER_PAGE_SIZE));
  const page = Math.min(Math.max(1, query.page), pageCount);
  const skip = (page - 1) * LEDGER_PAGE_SIZE;

  const ordered =
    total === 0
      ? []
      : await db.$queryRaw<{ id: string }[]>`
          SELECT a.id
          ${ledgerFromSql()}
          ${filteredWhere}
          ORDER BY ${ledgerOrderSql(query)}
          LIMIT ${LEDGER_PAGE_SIZE}
          OFFSET ${skip}
        `;

  const loaded =
    ordered.length === 0
      ? []
      : await db.absence.findMany({
          where: { tenantId, id: { in: ordered.map((row) => row.id) } },
          select: ledgerListSelect,
        });
  const order = new Map(ordered.map((row, index) => [row.id, index]));
  loaded.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  const presence = await sicknessIssueSummaryPresence(
    db,
    tenantId,
    loaded.map((row) => row.id),
  );

  return {
    rows: withLedgerProjection(loaded, presence),
    total,
    activeTotal,
    activeTypeCounts,
    matchingTypeCounts,
    page,
    pageCount,
  };
}

export async function listActiveCancellationsForLedger(
  db: PrismaClient,
  tenantId: string,
  query: LedgerListQuery,
): Promise<LedgerListResult> {
  return listAbsencesForLedger(db, tenantId, {
    ...query,
    view: "cancellations",
  });
}

export async function listActiveAwolsForLedger(
  db: PrismaClient,
  tenantId: string,
  query: LedgerListQuery,
): Promise<LedgerListResult> {
  return listAbsencesForLedger(db, tenantId, { ...query, view: "awol" });
}

export async function listSicknessForLedger(
  db: PrismaClient,
  tenantId: string,
  query: LedgerListQuery,
): Promise<LedgerListResult> {
  return listAbsencesForLedger(db, tenantId, { ...query, view: "sickness" });
}
