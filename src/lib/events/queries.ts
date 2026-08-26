import { EventStatus, Prisma, type PrismaClient } from "@prisma/client";
import { londonTodayIso, parseLocalDate } from "@/lib/events/dates";
import { EventAccessError } from "@/lib/events/errors";
import type { EventListQuery, VenueListQuery } from "@/lib/events/schema";

export const EVENT_PAGE_SIZE = 20;
export const VENUE_PAGE_SIZE = 20;

export const eventDetailInclude = {
  venue: true,
  eventType: true,
  eventSubtype: true,
} satisfies Prisma.EventInclude;

export type EventDetail = Prisma.EventGetPayload<{
  include: typeof eventDetailInclude;
}>;

type DbClient = PrismaClient | Prisma.TransactionClient;

export async function getEventForTenant(
  db: DbClient,
  tenantId: string,
  eventId: string,
): Promise<EventDetail> {
  const event = await db.event.findFirst({
    where: { id: eventId, tenantId, deletedAt: null },
    include: eventDetailInclude,
  });
  if (!event) {
    throw new EventAccessError();
  }
  return event;
}

function dateBounds(query: EventListQuery) {
  const today = parseLocalDate(londonTodayIso());
  const from = query.from ? parseLocalDate(query.from) : null;
  const to = query.to ? parseLocalDate(query.to) : null;
  return { today, from, to };
}

function dateFilter(query: EventListQuery): Prisma.DateTimeFilter | undefined {
  const { today, from, to } = dateBounds(query);
  const filter: Prisma.DateTimeFilter = {};

  if (query.range === "upcoming" && today) {
    filter.gte = today;
  }
  if (query.range === "past" && today) {
    filter.lt = today;
  }
  if (from) {
    filter.gte = from;
  }
  if (to) {
    filter.lte = to;
  }

  return Object.keys(filter).length > 0 ? filter : undefined;
}

function listWhere(
  tenantId: string,
  query: EventListQuery,
): Prisma.EventWhereInput {
  const eventDate = dateFilter(query);
  const search = query.q.trim();

  return {
    tenantId,
    deletedAt: null,
    ...(query.status
      ? { status: query.status as EventStatus }
      : {}),
    ...(query.type ? { eventTypeId: query.type } : {}),
    ...(eventDate ? { eventDate } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { reference: { contains: search, mode: "insensitive" } },
            { venue: { name: { contains: search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
}

export async function listEventsForTenant(
  db: PrismaClient,
  tenantId: string,
  query: EventListQuery,
): Promise<{ events: EventDetail[]; total: number; page: number; pageCount: number }> {
  const where = listWhere(tenantId, query);
  const { from, to } = dateBounds(query);
  const todayIso = londonTodayIso();
  const skip = (query.page - 1) * EVENT_PAGE_SIZE;
  const search = query.q.trim();

  const [ids, total] = await Promise.all([
    db.$queryRaw<{ id: string }[]>`
      SELECT e.id
      FROM "Event" e
      INNER JOIN "Venue" v ON v.id = e."venueId"
      WHERE e."tenantId" = ${tenantId}
        AND e."deletedAt" IS NULL
        ${query.status ? Prisma.sql`AND e.status = ${query.status}::"EventStatus"` : Prisma.empty}
        ${query.type ? Prisma.sql`AND e."eventTypeId" = ${query.type}` : Prisma.empty}
        ${
          query.range === "upcoming"
            ? Prisma.sql`AND e."eventDate" >= ${todayIso}::date`
            : Prisma.empty
        }
        ${
          query.range === "past"
            ? Prisma.sql`AND e."eventDate" < ${todayIso}::date`
            : Prisma.empty
        }
        ${
          from
            ? Prisma.sql`AND e."eventDate" >= ${query.from}::date`
            : Prisma.empty
        }
        ${
          to
            ? Prisma.sql`AND e."eventDate" <= ${query.to}::date`
            : Prisma.empty
        }
        ${
          search
            ? Prisma.sql`AND (
                e.name ILIKE ${"%" + search + "%"}
                OR COALESCE(e.reference, '') ILIKE ${"%" + search + "%"}
                OR v.name ILIKE ${"%" + search + "%"}
              )`
            : Prisma.empty
        }
      ORDER BY
        (e."eventDate" >= ${todayIso}::date) DESC,
        CASE WHEN e."eventDate" >= ${todayIso}::date THEN e."eventDate" END ASC,
        CASE WHEN e."eventDate" < ${todayIso}::date THEN e."eventDate" END DESC,
        e.name ASC
      LIMIT ${EVENT_PAGE_SIZE}
      OFFSET ${skip}
    `,
    db.event.count({ where }),
  ]);

  const events =
    ids.length === 0
      ? []
      : await db.event.findMany({
          where: {
            tenantId,
            id: { in: ids.map((row) => row.id) },
          },
          include: eventDetailInclude,
        });

  const order = new Map(ids.map((row, index) => [row.id, index]));
  events.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  return {
    events,
    total,
    page: query.page,
    pageCount: Math.max(1, Math.ceil(total / EVENT_PAGE_SIZE)),
  };
}

export async function listEventTypesForTenant(
  db: DbClient,
  tenantId: string,
) {
  return db.eventType.findMany({
    where: { tenantId, active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      subtypes: {
        where: { active: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true, code: true, eventTypeId: true },
      },
    },
  });
}

export async function listVenuesForTenant(db: DbClient, tenantId: string) {
  return db.venue.findMany({
    where: { tenantId, active: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      postcode: true,
      addressLine1: true,
      townCity: true,
    },
  });
}

export async function listVenuesForSettings(
  db: PrismaClient,
  tenantId: string,
  query: VenueListQuery,
) {
  const search = query.q.trim();
  const where: Prisma.VenueWhereInput = {
    tenantId,
    ...(query.status === "active" ? { active: true } : {}),
    ...(query.status === "inactive" ? { active: false } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { postcode: { contains: search, mode: "insensitive" } },
            { townCity: { contains: search, mode: "insensitive" } },
            { addressLine1: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const skip = (query.page - 1) * VENUE_PAGE_SIZE;
  const [venues, total] = await Promise.all([
    db.venue.findMany({
      where,
      orderBy: [{ active: "desc" }, { name: "asc" }],
      skip,
      take: VENUE_PAGE_SIZE,
      select: {
        id: true,
        name: true,
        addressLine1: true,
        townCity: true,
        postcode: true,
        active: true,
        _count: {
          select: {
            events: { where: { deletedAt: null } },
          },
        },
      },
    }),
    db.venue.count({ where }),
  ]);

  return {
    venues,
    total,
    page: query.page,
    pageCount: Math.max(1, Math.ceil(total / VENUE_PAGE_SIZE)),
  };
}
