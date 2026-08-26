import { Prisma, type PrismaClient } from "@prisma/client";
import { DEFAULT_TIMEZONE } from "@/lib/events/catalog";
import { parseLocalDate } from "@/lib/events/dates";
import {
  normalizeUkPostcode,
  normalizeVenueName,
  normalizeVenueNameKey,
} from "@/lib/events/normalize";
import { EventAccessError } from "@/lib/events/errors";
import type { EventInput } from "@/lib/events/schema";

export { EventAccessError };

export type EventMutationResult =
  | { ok: true; id: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

type DbClient = PrismaClient | Prisma.TransactionClient;

function uniqueTarget(error: Prisma.PrismaClientKnownRequestError): string[] {
  const target = error.meta?.target;
  if (Array.isArray(target)) {
    return target.map(String);
  }
  if (typeof target === "string") {
    return [target];
  }
  return [];
}

async function assertTypeAndSubtype(
  db: DbClient,
  tenantId: string,
  eventTypeId: string,
  eventSubtypeId: string,
): Promise<{ ok: true } | { ok: false; fieldErrors: Record<string, string[]> }> {
  const eventType = await db.eventType.findFirst({
    where: { id: eventTypeId, tenantId, active: true },
    select: { id: true },
  });
  if (!eventType) {
    return {
      ok: false,
      fieldErrors: { eventTypeId: ["Select a valid event type"] },
    };
  }

  const eventSubtype = await db.eventSubtype.findFirst({
    where: {
      id: eventSubtypeId,
      tenantId,
      eventTypeId,
      active: true,
    },
    select: { id: true },
  });
  if (!eventSubtype) {
    return {
      ok: false,
      fieldErrors: {
        eventSubtypeId: ["Select a valid subtype for this event type"],
      },
    };
  }

  return { ok: true };
}

async function resolveVenue(
  db: DbClient,
  tenantId: string,
  input: EventInput,
): Promise<
  | { ok: true; venueId: string }
  | { ok: false; fieldErrors: Record<string, string[]> }
> {
  if (input.newVenueName) {
    const name = normalizeVenueName(input.newVenueName);
    const nameNormalized = normalizeVenueNameKey(name);
    const postcode = input.newVenuePostcode
      ? normalizeUkPostcode(input.newVenuePostcode)
      : null;

    const existing = await db.venue.findUnique({
      where: {
        tenantId_nameNormalized: { tenantId, nameNormalized },
      },
    });

    if (existing) {
      if (!existing.active) {
        await db.venue.update({
          where: { id: existing.id },
          data: {
            active: true,
            postcode: postcode ?? existing.postcode,
            addressLine1: input.newVenueAddressLine1 ?? existing.addressLine1,
            townCity: input.newVenueTownCity ?? existing.townCity,
          },
        });
      }
      return { ok: true, venueId: existing.id };
    }

    try {
      const created = await db.venue.create({
        data: {
          tenantId,
          name,
          nameNormalized,
          addressLine1: input.newVenueAddressLine1,
          townCity: input.newVenueTownCity,
          postcode,
          timezone: DEFAULT_TIMEZONE,
          active: true,
        },
      });
      return { ok: true, venueId: created.id };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const raced = await db.venue.findUnique({
          where: {
            tenantId_nameNormalized: { tenantId, nameNormalized },
          },
        });
        if (raced) {
          return { ok: true, venueId: raced.id };
        }
      }
      throw error;
    }
  }

  if (!input.venueId) {
    return {
      ok: false,
      fieldErrors: { venueId: ["Select a venue or add a new one"] },
    };
  }

  const venue = await db.venue.findFirst({
    where: { id: input.venueId, tenantId, active: true },
    select: { id: true },
  });
  if (!venue) {
    return {
      ok: false,
      fieldErrors: { venueId: ["Select a valid venue"] },
    };
  }

  return { ok: true, venueId: venue.id };
}

function eventWriteData(input: EventInput, venueId: string) {
  const eventDate = parseLocalDate(input.eventDate);
  if (!eventDate) {
    throw new Error("Invalid event date");
  }
  return {
    reference: input.reference,
    name: input.name,
    eventTypeId: input.eventTypeId,
    eventSubtypeId: input.eventSubtypeId,
    venueId,
    eventDate,
    briefingTime: input.briefingTime,
    startTime: input.startTime,
    endTime: input.endTime,
    endsNextDay: input.endsNextDay,
    staffRequired: input.staffRequired,
    warningFillRate: input.warningFillRate,
    criticalFillRate: input.criticalFillRate,
    status: input.status,
    notes: input.notes,
  };
}

export async function createEvent(
  db: DbClient,
  params: { tenantId: string; userId: string; input: EventInput },
): Promise<EventMutationResult> {
  const taxonomy = await assertTypeAndSubtype(
    db,
    params.tenantId,
    params.input.eventTypeId,
    params.input.eventSubtypeId,
  );
  if (!taxonomy.ok) {
    return {
      ok: false,
      error: "Check the form and try again.",
      fieldErrors: taxonomy.fieldErrors,
    };
  }

  try {
    const venue = await resolveVenue(db, params.tenantId, params.input);
    if (!venue.ok) {
      return {
        ok: false,
        error: "Check the form and try again.",
        fieldErrors: venue.fieldErrors,
      };
    }

    const event = await db.event.create({
      data: {
        tenantId: params.tenantId,
        ...eventWriteData(params.input, venue.venueId),
        createdById: params.userId,
        updatedById: params.userId,
      },
      select: { id: true },
    });

    return { ok: true, id: event.id };
  } catch (error) {
    return mapWriteError(error);
  }
}

export async function updateEvent(
  db: DbClient,
  params: {
    tenantId: string;
    userId: string;
    eventId: string;
    input: EventInput;
  },
): Promise<EventMutationResult> {
  const existing = await db.event.findFirst({
    where: {
      id: params.eventId,
      tenantId: params.tenantId,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!existing) {
    throw new EventAccessError();
  }

  const taxonomy = await assertTypeAndSubtype(
    db,
    params.tenantId,
    params.input.eventTypeId,
    params.input.eventSubtypeId,
  );
  if (!taxonomy.ok) {
    return {
      ok: false,
      error: "Check the form and try again.",
      fieldErrors: taxonomy.fieldErrors,
    };
  }

  try {
    const venue = await resolveVenue(db, params.tenantId, params.input);
    if (!venue.ok) {
      return {
        ok: false,
        error: "Check the form and try again.",
        fieldErrors: venue.fieldErrors,
      };
    }

    await db.event.update({
      where: { id: existing.id },
      data: {
        ...eventWriteData(params.input, venue.venueId),
        updatedById: params.userId,
      },
    });

    return { ok: true, id: existing.id };
  } catch (error) {
    return mapWriteError(error);
  }
}

export async function deleteEvent(
  db: DbClient,
  params: { tenantId: string; userId: string; eventId: string },
): Promise<{ ok: true }> {
  const existing = await db.event.findFirst({
    where: {
      id: params.eventId,
      tenantId: params.tenantId,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!existing) {
    throw new EventAccessError();
  }

  await db.event.update({
    where: { id: existing.id },
    data: {
      deletedAt: new Date(),
      deletedById: params.userId,
      updatedById: params.userId,
    },
  });

  return { ok: true };
}

function mapWriteError(error: unknown): EventMutationResult {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    const target = uniqueTarget(error);
    if (target.includes("reference")) {
      return {
        ok: false,
        error: "Check the form and try again.",
        fieldErrors: {
          reference: ["This reference is already used for another event"],
        },
      };
    }
    if (target.includes("nameNormalized")) {
      return {
        ok: false,
        error: "Check the form and try again.",
        fieldErrors: {
          newVenueName: ["A venue with this name already exists"],
        },
      };
    }
  }

  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2003"
  ) {
    return {
      ok: false,
      error: "Check the form and try again.",
      fieldErrors: {
        eventSubtypeId: ["Select a valid subtype for this event type"],
      },
    };
  }

  return { ok: false, error: "Could not save the event. Please try again." };
}
