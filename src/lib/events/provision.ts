import type { Prisma, PrismaClient } from "@prisma/client";
import {
  CENTRE_CIRCLE_VENUES,
  DEFAULT_TIMEZONE,
  EVENT_TYPE_CATALOG,
  isCentreCircleTenant,
} from "@/lib/events/catalog";
import { normalizeUkPostcode, normalizeVenueNameKey } from "@/lib/events/normalize";

type DbClient = PrismaClient | Prisma.TransactionClient;

export async function provisionTenantEventCatalog(
  db: DbClient,
  tenant: { id: string; name: string; slug: string },
): Promise<void> {
  for (const [typeIndex, typeSeed] of EVENT_TYPE_CATALOG.entries()) {
    const eventType = await db.eventType.upsert({
      where: {
        tenantId_code: {
          tenantId: tenant.id,
          code: typeSeed.code,
        },
      },
      update: {
        name: typeSeed.name,
        sortOrder: typeIndex,
      },
      create: {
        tenantId: tenant.id,
        name: typeSeed.name,
        code: typeSeed.code,
        sortOrder: typeIndex,
        active: true,
      },
    });

    for (const [subtypeIndex, subtypeSeed] of typeSeed.subtypes.entries()) {
      await db.eventSubtype.upsert({
        where: {
          tenantId_eventTypeId_code: {
            tenantId: tenant.id,
            eventTypeId: eventType.id,
            code: subtypeSeed.code,
          },
        },
        update: {
          name: subtypeSeed.name,
          sortOrder: subtypeIndex,
        },
        create: {
          tenantId: tenant.id,
          eventTypeId: eventType.id,
          name: subtypeSeed.name,
          code: subtypeSeed.code,
          sortOrder: subtypeIndex,
          active: true,
        },
      });
    }
  }

  if (!isCentreCircleTenant(tenant)) {
    return;
  }

  for (const venue of CENTRE_CIRCLE_VENUES) {
    const nameNormalized = normalizeVenueNameKey(venue.name);
    await db.venue.upsert({
      where: {
        tenantId_nameNormalized: {
          tenantId: tenant.id,
          nameNormalized,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        name: venue.name,
        nameNormalized,
        addressLine1: venue.addressLine1 ?? null,
        townCity: venue.townCity ?? null,
        postcode: venue.postcode
          ? normalizeUkPostcode(venue.postcode)
          : null,
        timezone: DEFAULT_TIMEZONE,
        active: true,
      },
    });
  }
}

export async function ensureTenantEventCatalog(
  db: DbClient,
  tenantId: string,
): Promise<void> {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true, slug: true },
  });
  if (!tenant) {
    return;
  }
  await provisionTenantEventCatalog(db, tenant);
}
