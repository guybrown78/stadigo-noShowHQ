import {
  Prisma,
  type EmploymentStatus,
  type PrismaClient,
} from "@prisma/client";
import {
  ABSENCE_EVENT_SEARCH_LIMIT,
  ABSENCE_STAFF_SEARCH_LIMIT,
  LEDGER_PAGE_SIZE,
  STAFF_ABSENCE_HISTORY_PAGE_SIZE,
  type LedgerSortDirection,
  type LedgerSortField,
} from "@/lib/absence/catalog";
import {
  isLedgerDateRangeInvalid,
  type LedgerListQuery,
} from "@/lib/absence/schema";
import { AbsenceAccessError } from "@/lib/absence/errors";
import {
  formatLocalDateIso,
  londonTodayIso,
  parseLocalDate,
} from "@/lib/events/dates";

export { LEDGER_PAGE_SIZE, STAFF_ABSENCE_HISTORY_PAGE_SIZE };

type DbClient = PrismaClient | Prisma.TransactionClient;

export const absenceDetailInclude = {
  staff: {
    select: {
      id: true,
      staffIdNumber: true,
      firstName: true,
      lastName: true,
      roleTitle: true,
      employmentStatus: true,
      deletedAt: true,
    },
  },
  event: {
    include: {
      venue: true,
      eventType: true,
      eventSubtype: true,
    },
  },
  cancellation: true,
  history: {
    orderBy: { createdAt: "desc" as const },
    include: {
      actedBy: {
        select: { firstName: true, lastName: true },
      },
    },
  },
  createdBy: {
    select: { firstName: true, lastName: true },
  },
  updatedBy: {
    select: { firstName: true, lastName: true },
  },
  archivedBy: {
    select: { firstName: true, lastName: true },
  },
} satisfies Prisma.AbsenceInclude;

export type AbsenceDetail = Prisma.AbsenceGetPayload<{
  include: typeof absenceDetailInclude;
}>;

export type AbsenceStaffOption = {
  id: string;
  staffIdNumber: string;
  firstName: string;
  lastName: string;
  roleTitle: string;
  employmentStatus: EmploymentStatus;
};

export type AbsenceEventOption = {
  id: string;
  name: string;
  reference: string | null;
  eventDate: string;
  startTime: string | null;
  venueName: string;
  eventTypeName: string;
  eventSubtypeName: string;
};

export type StaffAbsenceHistoryItem = Prisma.AbsenceGetPayload<{
  include: {
    cancellation: true;
  };
}>;

const ledgerListSelect = {
  id: true,
  type: true,
  reportedDate: true,
  reportedTime: true,
  reason: true,
  createdAt: true,
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
      eventType: {
        select: { name: true },
      },
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
} satisfies Prisma.AbsenceSelect;

export type LedgerCancellationRow = Prisma.AbsenceGetPayload<{
  select: typeof ledgerListSelect;
}>;

export type LedgerFilterOptions = {
  venues: { id: string; name: string }[];
  eventTypes: { id: string; name: string }[];
};

function parseEventSearchDate(query: string): Date | null {
  const trimmed = query.trim();
  const iso = parseLocalDate(trimmed);
  if (iso) {
    return iso;
  }
  const uk = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!uk) {
    return null;
  }
  return parseLocalDate(
    `${uk[3]}-${uk[2].padStart(2, "0")}-${uk[1].padStart(2, "0")}`,
  );
}

export async function getAbsenceForTenant(
  db: DbClient,
  tenantId: string,
  absenceId: string,
): Promise<AbsenceDetail> {
  const absence = await db.absence.findFirst({
    where: { id: absenceId, tenantId },
    include: absenceDetailInclude,
  });
  if (!absence) {
    throw new AbsenceAccessError();
  }
  return absence;
}

export async function searchStaffForAbsence(
  db: DbClient,
  tenantId: string,
  query: string,
): Promise<AbsenceStaffOption[]> {
  const search = query.trim();
  return db.staff.findMany({
    where: {
      tenantId,
      deletedAt: null,
      ...(search
        ? {
            OR: [
              { staffIdNumber: { contains: search, mode: "insensitive" } },
              { firstName: { contains: search, mode: "insensitive" } },
              { lastName: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      staffIdNumber: true,
      firstName: true,
      lastName: true,
      roleTitle: true,
      employmentStatus: true,
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: ABSENCE_STAFF_SEARCH_LIMIT,
  });
}

export async function getStaffOptionForAbsence(
  db: DbClient,
  tenantId: string,
  staffId: string,
): Promise<AbsenceStaffOption | null> {
  return db.staff.findFirst({
    where: { id: staffId, tenantId, deletedAt: null },
    select: {
      id: true,
      staffIdNumber: true,
      firstName: true,
      lastName: true,
      roleTitle: true,
      employmentStatus: true,
    },
  });
}

export async function searchEventsForAbsence(
  db: PrismaClient,
  tenantId: string,
  query: string,
): Promise<AbsenceEventOption[]> {
  const search = query.trim();
  const todayIso = londonTodayIso();
  const parsedDate = parseEventSearchDate(search);
  const dateIso = parsedDate ? formatLocalDateIso(parsedDate) : null;

  const ids = await db.$queryRaw<{ id: string }[]>`
    SELECT e.id
    FROM "Event" e
    INNER JOIN "Venue" v ON v.id = e."venueId"
    WHERE e."tenantId" = ${tenantId}
      AND e."deletedAt" IS NULL
      ${
        search
          ? Prisma.sql`AND (
              e.name ILIKE ${"%" + search + "%"}
              OR COALESCE(e.reference, '') ILIKE ${"%" + search + "%"}
              OR v.name ILIKE ${"%" + search + "%"}
              ${dateIso ? Prisma.sql`OR e."eventDate" = ${dateIso}::date` : Prisma.empty}
            )`
          : Prisma.empty
      }
    ORDER BY
      (e."eventDate" >= ${todayIso}::date) DESC,
      CASE WHEN e."eventDate" >= ${todayIso}::date THEN e."eventDate" END ASC,
      CASE WHEN e."eventDate" < ${todayIso}::date THEN e."eventDate" END DESC,
      e.name ASC
    LIMIT ${ABSENCE_EVENT_SEARCH_LIMIT}
  `;

  if (ids.length === 0) {
    return [];
  }

  const events = await db.event.findMany({
    where: { tenantId, id: { in: ids.map((row) => row.id) } },
    include: {
      venue: { select: { name: true } },
      eventType: { select: { name: true } },
      eventSubtype: { select: { name: true } },
    },
  });
  const order = new Map(ids.map((row, index) => [row.id, index]));
  events.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  return events.map((event) => ({
    id: event.id,
    name: event.name,
    reference: event.reference,
    eventDate: formatLocalDateIso(event.eventDate),
    startTime: event.startTime,
    venueName: event.venue.name,
    eventTypeName: event.eventType.name,
    eventSubtypeName: event.eventSubtype.name,
  }));
}

export async function getEventOptionForAbsence(
  db: DbClient,
  tenantId: string,
  eventId: string,
): Promise<AbsenceEventOption | null> {
  const event = await db.event.findFirst({
    where: { id: eventId, tenantId, deletedAt: null },
    include: {
      venue: { select: { name: true } },
      eventType: { select: { name: true } },
      eventSubtype: { select: { name: true } },
    },
  });
  if (!event) {
    return null;
  }
  return {
    id: event.id,
    name: event.name,
    reference: event.reference,
    eventDate: formatLocalDateIso(event.eventDate),
    startTime: event.startTime,
    venueName: event.venue.name,
    eventTypeName: event.eventType.name,
    eventSubtypeName: event.eventSubtype.name,
  };
}

export async function listActiveAbsencesForStaff(
  db: DbClient,
  tenantId: string,
  staffId: string,
  page = 1,
): Promise<{
  absences: StaffAbsenceHistoryItem[];
  total: number;
  page: number;
  pageCount: number;
}> {
  const where: Prisma.AbsenceWhereInput = {
    tenantId,
    staffId,
    recordStatus: "ACTIVE",
  };
  const total = await db.absence.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / STAFF_ABSENCE_HISTORY_PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), pageCount);
  const skip = (currentPage - 1) * STAFF_ABSENCE_HISTORY_PAGE_SIZE;
  const absences = await db.absence.findMany({
    where,
    include: { cancellation: true },
    orderBy: [
      { cancellation: { eventDateSnapshot: "desc" } },
      { reportedDate: "desc" },
      { createdAt: "desc" },
    ],
    skip,
    take: STAFF_ABSENCE_HISTORY_PAGE_SIZE,
  });
  return {
    absences,
    total,
    page: currentPage,
    pageCount,
  };
}

export async function findActiveDuplicateCancellation(
  db: DbClient,
  params: {
    tenantId: string;
    staffId: string;
    eventId: string;
    excludeId?: string;
  },
) {
  return db.absence.findFirst({
    where: {
      tenantId: params.tenantId,
      staffId: params.staffId,
      eventId: params.eventId,
      type: "CANCELLATION",
      recordStatus: "ACTIVE",
      ...(params.excludeId ? { id: { not: params.excludeId } } : {}),
    },
    select: { id: true },
  });
}

function ledgerSearchWhere(search: string): Prisma.AbsenceWhereInput[] {
  const tokens = search.split(/\s+/).filter(Boolean);
  const clauses: Prisma.AbsenceWhereInput[] = [
    { staff: { firstName: { contains: search, mode: "insensitive" } } },
    { staff: { lastName: { contains: search, mode: "insensitive" } } },
    { staff: { staffIdNumber: { contains: search, mode: "insensitive" } } },
    {
      cancellation: {
        eventNameSnapshot: { contains: search, mode: "insensitive" },
      },
    },
    { event: { reference: { contains: search, mode: "insensitive" } } },
  ];
  if (tokens.length >= 2) {
    clauses.push({
      staff: {
        AND: [
          { firstName: { contains: tokens[0], mode: "insensitive" } },
          {
            lastName: {
              contains: tokens.slice(1).join(" "),
              mode: "insensitive",
            },
          },
        ],
      },
    });
  }
  return clauses;
}

function ledgerListWhere(
  tenantId: string,
  query: LedgerListQuery,
): Prisma.AbsenceWhereInput {
  const search = query.q.trim();
  const skipDates = isLedgerDateRangeInvalid(query);
  const from = !skipDates && query.reportedFrom
    ? parseLocalDate(query.reportedFrom)
    : null;
  const to = !skipDates && query.reportedTo
    ? parseLocalDate(query.reportedTo)
    : null;

  const reportedDate: Prisma.DateTimeFilter = {};
  if (from) {
    reportedDate.gte = from;
  }
  if (to) {
    reportedDate.lte = to;
  }

  return {
    tenantId,
    type: "CANCELLATION",
    recordStatus: "ACTIVE",
    cancellation: query.venue
      ? { venueIdSnapshot: query.venue }
      : { isNot: null },
    ...(query.eventType ? { event: { eventTypeId: query.eventType } } : {}),
    ...(Object.keys(reportedDate).length > 0 ? { reportedDate } : {}),
    ...(search ? { OR: ledgerSearchWhere(search) } : {}),
  };
}

function ledgerOrderBy(
  sort: LedgerSortField,
  direction: LedgerSortDirection,
): Prisma.AbsenceOrderByWithRelationInput[] {
  const idTie: Prisma.AbsenceOrderByWithRelationInput = { id: direction };
  if (sort === "eventDate") {
    return [{ cancellation: { eventDateSnapshot: direction } }, idTie];
  }
  if (sort === "staff") {
    return [
      { staff: { lastName: direction } },
      { staff: { firstName: direction } },
      idTie,
    ];
  }
  if (sort === "event") {
    return [{ cancellation: { eventNameSnapshot: direction } }, idTie];
  }
  if (sort === "notice") {
    return [
      { cancellation: { noticeCalendarDays: direction } },
      {
        cancellation: {
          noticeMinutes: { sort: direction, nulls: "last" },
        },
      },
      idTie,
    ];
  }
  return [
    { reportedDate: direction },
    { reportedTime: { sort: direction, nulls: "last" } },
    { createdAt: direction },
    idTie,
  ];
}

const activeCancellationWhere = (
  tenantId: string,
): Prisma.AbsenceWhereInput => ({
  tenantId,
  type: "CANCELLATION",
  recordStatus: "ACTIVE",
  cancellation: { isNot: null },
});

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

export async function listActiveCancellationsForLedger(
  db: PrismaClient,
  tenantId: string,
  query: LedgerListQuery,
): Promise<{
  rows: LedgerCancellationRow[];
  total: number;
  activeTotal: number;
  page: number;
  pageCount: number;
}> {
  const where = ledgerListWhere(tenantId, query);
  const orderBy = ledgerOrderBy(query.sort, query.direction);
  const skip = (query.page - 1) * LEDGER_PAGE_SIZE;

  const [total, activeTotal, rows] = await Promise.all([
    db.absence.count({ where }),
    db.absence.count({ where: activeCancellationWhere(tenantId) }),
    db.absence.findMany({
      where,
      select: ledgerListSelect,
      orderBy,
      skip,
      take: LEDGER_PAGE_SIZE,
    }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / LEDGER_PAGE_SIZE));
  const page = Math.min(query.page, pageCount);
  if (page !== query.page && total > 0) {
    const adjusted = await db.absence.findMany({
      where,
      select: ledgerListSelect,
      orderBy,
      skip: (page - 1) * LEDGER_PAGE_SIZE,
      take: LEDGER_PAGE_SIZE,
    });
    return { rows: adjusted, total, activeTotal, page, pageCount };
  }

  return { rows, total, activeTotal, page: query.page, pageCount };
}
