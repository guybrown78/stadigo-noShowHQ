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
} from "@/lib/absence/catalog";
import { requireIanaTimeZone } from "@/lib/absence/timezone";
import { AbsenceAccessError } from "@/lib/absence/errors";
import { issueSummaryPresent } from "@/lib/absence/sensitive";
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
  awol: true,
  sickness: true,
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
  endTime: string | null;
  venueName: string;
  eventTypeName: string;
  eventSubtypeName: string;
};

export type StaffAbsenceHistoryItem = {
  id: string;
  type: "CANCELLATION" | "AWOL" | "SICKNESS";
  recordStatus: "ACTIVE" | "ARCHIVED";
  reportedDate: Date;
  createdAt: Date;
  notes: string | null;
  reason: string | null;
  cancellation: {
    eventNameSnapshot: string;
    eventDateSnapshot: Date;
    noticeBasis: "EXACT_TIME" | "CALENDAR_DATE";
    noticeMinutes: number | null;
    noticeCalendarDays: number;
  } | null;
  awol: {
    eventNameSnapshot: string;
    eventDateSnapshot: Date;
    venueNameSnapshot: string | null;
  } | null;
  sickness: {
    firstWorkingDaySick: Date;
    sicknessStartedDate: Date | null;
    issueSummaryPresent: boolean;
  } | null;
};

export type AbsenceEventSearchMode = "cancellation" | "awol";

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

export async function getTenantTimezone(
  db: DbClient,
  tenantId: string,
): Promise<string> {
  const tenant = await db.tenant.findFirst({
    where: { id: tenantId },
    select: { timezone: true },
  });
  return requireIanaTimeZone(tenant?.timezone);
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
  options: { mode?: AbsenceEventSearchMode; todayIso?: string } = {},
): Promise<AbsenceEventOption[]> {
  const search = query.trim();
  const todayIso = options.todayIso ?? londonTodayIso();
  const parsedDate = parseEventSearchDate(search);
  const dateIso = parsedDate ? formatLocalDateIso(parsedDate) : null;
  const awolOnly = options.mode === "awol";

  const ids = await db.$queryRaw<{ id: string }[]>`
    SELECT e.id
    FROM "Event" e
    INNER JOIN "Venue" v ON v.id = e."venueId"
    WHERE e."tenantId" = ${tenantId}
      AND e."deletedAt" IS NULL
      ${awolOnly ? Prisma.sql`AND e."eventDate" <= ${todayIso}::date` : Prisma.empty}
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
      ${
        awolOnly
          ? Prisma.sql`
            (e."eventDate" = ${todayIso}::date) DESC,
            e."eventDate" DESC,
            e.name ASC
          `
          : Prisma.sql`
            (e."eventDate" >= ${todayIso}::date) DESC,
            CASE WHEN e."eventDate" >= ${todayIso}::date THEN e."eventDate" END ASC,
            CASE WHEN e."eventDate" < ${todayIso}::date THEN e."eventDate" END DESC,
            e.name ASC
          `
      }
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
    endTime: event.endTime,
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
    endTime: event.endTime,
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
  options: { includeArchivedSickness?: boolean } = {},
): Promise<{
  absences: StaffAbsenceHistoryItem[];
  total: number;
  page: number;
  pageCount: number;
  archivedSicknessCount: number;
}> {
  const includeArchivedSickness = Boolean(options.includeArchivedSickness);
  const where: Prisma.AbsenceWhereInput = {
    tenantId,
    staffId,
    ...(includeArchivedSickness
      ? {
          OR: [
            { recordStatus: "ACTIVE" },
            { recordStatus: "ARCHIVED", type: "SICKNESS" },
          ],
        }
      : { recordStatus: "ACTIVE" }),
  };
  const [total, archivedSicknessCount] = await Promise.all([
    db.absence.count({ where }),
    db.absence.count({
      where: {
        tenantId,
        staffId,
        type: "SICKNESS",
        recordStatus: "ARCHIVED",
      },
    }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / STAFF_ABSENCE_HISTORY_PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), pageCount);
  const skip = (currentPage - 1) * STAFF_ABSENCE_HISTORY_PAGE_SIZE;
  const ordered = await db.$queryRaw<{ id: string }[]>`
    SELECT a.id
    FROM "Absence" a
    LEFT JOIN "CancellationDetail" c ON c."absenceId" = a.id
    LEFT JOIN "AwolDetail" w ON w."absenceId" = a.id
    LEFT JOIN "SicknessDetail" s ON s."absenceId" = a.id
    WHERE a."tenantId" = ${tenantId}
      AND a."staffId" = ${staffId}
      AND (
        a."recordStatus" = 'ACTIVE'
        ${
          includeArchivedSickness
            ? Prisma.sql`OR (a.type = 'SICKNESS' AND a."recordStatus" = 'ARCHIVED')`
            : Prisma.empty
        }
      )
    ORDER BY
      COALESCE(c."eventDateSnapshot", w."eventDateSnapshot", s."firstWorkingDaySick", a."reportedDate") DESC,
      a."reportedDate" DESC,
      a."createdAt" DESC,
      a.id DESC
    LIMIT ${STAFF_ABSENCE_HISTORY_PAGE_SIZE}
    OFFSET ${skip}
  `;
  const loaded =
    ordered.length === 0
      ? []
      : await db.absence.findMany({
          where: { tenantId, id: { in: ordered.map((row) => row.id) } },
          include: { cancellation: true, awol: true, sickness: true },
        });
  const order = new Map(ordered.map((row, index) => [row.id, index]));
  loaded.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  const absences: StaffAbsenceHistoryItem[] = loaded.map((absence) => ({
    id: absence.id,
    type: absence.type,
    recordStatus: absence.recordStatus,
    reportedDate: absence.reportedDate,
    createdAt: absence.createdAt,
    notes: absence.notes,
    reason: absence.reason,
    cancellation: absence.cancellation
      ? {
          eventNameSnapshot: absence.cancellation.eventNameSnapshot,
          eventDateSnapshot: absence.cancellation.eventDateSnapshot,
          noticeBasis: absence.cancellation.noticeBasis,
          noticeMinutes: absence.cancellation.noticeMinutes,
          noticeCalendarDays: absence.cancellation.noticeCalendarDays,
        }
      : null,
    awol: absence.awol
      ? {
          eventNameSnapshot: absence.awol.eventNameSnapshot,
          eventDateSnapshot: absence.awol.eventDateSnapshot,
          venueNameSnapshot: absence.awol.venueNameSnapshot,
        }
      : null,
    sickness: absence.sickness
      ? {
          firstWorkingDaySick: absence.sickness.firstWorkingDaySick,
          sicknessStartedDate: absence.sickness.sicknessStartedDate,
          issueSummaryPresent: issueSummaryPresent(
            absence.sickness.issueSummary,
          ),
        }
      : null,
  }));
  return {
    absences,
    total,
    page: currentPage,
    pageCount,
    archivedSicknessCount,
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
    select: { id: true, type: true },
  });
}

export async function findActiveSicknessDuplicate(
  db: DbClient,
  params: {
    tenantId: string;
    staffId: string;
    firstWorkingDaySick: Date;
    excludeId?: string;
  },
) {
  return db.absence.findFirst({
    where: {
      tenantId: params.tenantId,
      staffId: params.staffId,
      firstWorkingDaySick: params.firstWorkingDaySick,
      recordStatus: "ACTIVE",
      type: "SICKNESS",
      ...(params.excludeId ? { id: { not: params.excludeId } } : {}),
    },
    select: { id: true },
  });
}

export async function findActiveCancellationOrAwol(
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
      recordStatus: "ACTIVE",
      type: { in: ["CANCELLATION", "AWOL"] },
      ...(params.excludeId ? { id: { not: params.excludeId } } : {}),
    },
    select: { id: true, type: true },
  });
}

export {
  UNSPECIFIED_EVENT_TYPE_FILTER,
  listAbsencesForLedger,
  listActiveAwolsForLedger,
  listActiveCancellationsForLedger,
  listAwolLedgerFilterOptions,
  listLedgerFilterOptions,
  listSicknessForLedger,
  type AwolLedgerFilterOptions,
  type LedgerAbsenceRow,
  type LedgerAwolRow,
  type LedgerCancellationRow,
  type LedgerFilterOptions,
  type LedgerSicknessRow,
  type LedgerTypeCounts,
} from "@/lib/absence/ledger-query";
