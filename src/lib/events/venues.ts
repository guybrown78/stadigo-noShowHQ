import { Prisma, type PrismaClient } from "@prisma/client";
import { DEFAULT_TIMEZONE } from "@/lib/events/catalog";
import { EventAccessError } from "@/lib/events/errors";
import {
  normalizeUkPostcode,
  normalizeVenueName,
  normalizeVenueNameKey,
} from "@/lib/events/normalize";
import type { VenueInput } from "@/lib/events/schema";

export { EventAccessError };

export type VenueMutationResult =
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

export function venueRecordData(tenantId: string, input: VenueInput) {
  const name = normalizeVenueName(input.name);
  return {
    tenantId,
    name,
    nameNormalized: normalizeVenueNameKey(name),
    addressLine1: input.addressLine1,
    townCity: input.townCity,
    postcode: input.postcode
      ? normalizeUkPostcode(input.postcode)
      : null,
    timezone: DEFAULT_TIMEZONE,
    active: input.active ?? true,
  };
}

export async function findOrCreateVenue(
  db: DbClient,
  params: {
    tenantId: string;
    input: {
      name: string;
      addressLine1?: string | null;
      townCity?: string | null;
      postcode?: string | null;
    };
    enrichInactive?: boolean;
  },
): Promise<
  | { ok: true; venueId: string; created: boolean }
  | { ok: false; fieldErrors: Record<string, string[]> }
> {
  const name = normalizeVenueName(params.input.name);
  const nameNormalized = normalizeVenueNameKey(name);
  const postcode = params.input.postcode
    ? normalizeUkPostcode(params.input.postcode)
    : null;

  const existing = await db.venue.findUnique({
    where: {
      tenantId_nameNormalized: {
        tenantId: params.tenantId,
        nameNormalized,
      },
    },
  });

  if (existing) {
    if (!existing.active) {
      await db.venue.update({
        where: { id: existing.id },
        data: {
          active: true,
          ...(params.enrichInactive
            ? {
                postcode: postcode ?? existing.postcode,
                addressLine1:
                  params.input.addressLine1 ?? existing.addressLine1,
                townCity: params.input.townCity ?? existing.townCity,
              }
            : {}),
        },
      });
    }
    return { ok: true, venueId: existing.id, created: false };
  }

  try {
    const created = await db.venue.create({
      data: {
        tenantId: params.tenantId,
        name,
        nameNormalized,
        addressLine1: params.input.addressLine1 ?? null,
        townCity: params.input.townCity ?? null,
        postcode,
        timezone: DEFAULT_TIMEZONE,
        active: true,
      },
      select: { id: true },
    });
    return { ok: true, venueId: created.id, created: true };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const raced = await db.venue.findUnique({
        where: {
          tenantId_nameNormalized: {
            tenantId: params.tenantId,
            nameNormalized,
          },
        },
      });
      if (raced) {
        if (!raced.active) {
          await db.venue.update({
            where: { id: raced.id },
            data: { active: true },
          });
        }
        return { ok: true, venueId: raced.id, created: false };
      }
    }
    return {
      ok: false,
      fieldErrors: { name: ["Could not save the venue. Please try again."] },
    };
  }
}

export async function getVenueForTenant(
  db: DbClient,
  tenantId: string,
  venueId: string,
) {
  const venue = await db.venue.findFirst({
    where: { id: venueId, tenantId },
  });
  if (!venue) {
    throw new EventAccessError();
  }
  return venue;
}

export async function createVenue(
  db: DbClient,
  params: { tenantId: string; input: VenueInput },
): Promise<VenueMutationResult> {
  try {
    const created = await db.venue.create({
      data: venueRecordData(params.tenantId, params.input),
      select: { id: true },
    });
    return { ok: true, id: created.id };
  } catch (error) {
    return mapVenueWriteError(error);
  }
}

export async function updateVenue(
  db: DbClient,
  params: { tenantId: string; venueId: string; input: VenueInput },
): Promise<VenueMutationResult> {
  const existing = await db.venue.findFirst({
    where: { id: params.venueId, tenantId: params.tenantId },
    select: { id: true },
  });
  if (!existing) {
    throw new EventAccessError();
  }

  try {
    await db.venue.update({
      where: { id: existing.id },
      data: venueRecordData(params.tenantId, params.input),
    });
    return { ok: true, id: existing.id };
  } catch (error) {
    return mapVenueWriteError(error);
  }
}

function mapVenueWriteError(error: unknown): VenueMutationResult {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    const target = uniqueTarget(error);
    if (target.includes("nameNormalized")) {
      return {
        ok: false,
        error: "Check the form and try again.",
        fieldErrors: {
          name: ["A venue with this name already exists"],
        },
      };
    }
  }

  return { ok: false, error: "Could not save the venue. Please try again." };
}
