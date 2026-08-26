import { Role } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { EventAccessError } from "@/lib/events/errors";
import { provisionTenantEventCatalog } from "@/lib/events/provision";
import { getEventForTenant, listEventsForTenant } from "@/lib/events/queries";
import type { EventInput } from "@/lib/events/schema";
import { createEvent, deleteEvent, updateEvent } from "@/lib/events/service";
import { createVenue, getVenueForTenant, updateVenue } from "@/lib/events/venues";

const prefix = `vitest-events-${Date.now()}`;

type Fixture = {
  tenant: { id: string; name: string; slug: string };
  user: { id: string };
  typeId: string;
  subtypeId: string;
  otherSubtypeId: string;
  venueId: string;
};

let tenantA: Fixture;
let tenantB: Fixture;

async function createFixture(label: string): Promise<Fixture> {
  const tenant = await prisma.tenant.create({
    data: {
      name: `Vitest ${label}`,
      slug: `${prefix}-${label}`.toLowerCase(),
    },
  });
  await provisionTenantEventCatalog(prisma, tenant);
  const user = await prisma.user.create({
    data: {
      email: `${prefix}-${label}@example.test`,
      firstName: "Test",
      lastName: label,
      name: `Test ${label}`,
      passwordHash: "not-used",
      role: Role.ADMIN,
      tenantId: tenant.id,
    },
  });
  const sporting = await prisma.eventType.findFirstOrThrow({
    where: { tenantId: tenant.id, code: "sporting" },
    include: { subtypes: { orderBy: { sortOrder: "asc" } } },
  });
  const music = await prisma.eventType.findFirstOrThrow({
    where: { tenantId: tenant.id, code: "music-and-entertainment" },
    include: { subtypes: { orderBy: { sortOrder: "asc" } } },
  });
  const venue = await prisma.venue.create({
    data: {
      tenantId: tenant.id,
      name: `Test Venue ${label}`,
      nameNormalized: `test venue ${label}`,
      timezone: "Europe/London",
      active: true,
    },
  });
  return {
    tenant,
    user,
    typeId: sporting.id,
    subtypeId: sporting.subtypes[0]!.id,
    otherSubtypeId: music.subtypes[0]!.id,
    venueId: venue.id,
  };
}

function inputFor(
  fixture: Fixture,
  overrides: Partial<EventInput> = {},
): EventInput {
  return {
    name: "West Ham v Arsenal",
    reference: null,
    eventTypeId: fixture.typeId,
    eventSubtypeId: fixture.subtypeId,
    venueId: fixture.venueId,
    newVenueName: null,
    newVenueAddressLine1: null,
    newVenueTownCity: null,
    newVenuePostcode: null,
    eventDate: "2026-09-12",
    briefingTime: "12:00",
    startTime: "14:00",
    endTime: "17:00",
    endsNextDay: false,
    staffRequired: 40,
    warningFillRate: 90,
    criticalFillRate: 85,
    status: "PLANNED",
    notes: null,
    ...overrides,
  };
}

beforeAll(async () => {
  tenantA = await createFixture("a");
  tenantB = await createFixture("b");
});

afterAll(async () => {
  await prisma.event.deleteMany({
    where: { tenantId: { in: [tenantA.tenant.id, tenantB.tenant.id] } },
  });
  await prisma.venue.deleteMany({
    where: { tenantId: { in: [tenantA.tenant.id, tenantB.tenant.id] } },
  });
  await prisma.eventSubtype.deleteMany({
    where: { tenantId: { in: [tenantA.tenant.id, tenantB.tenant.id] } },
  });
  await prisma.eventType.deleteMany({
    where: { tenantId: { in: [tenantA.tenant.id, tenantB.tenant.id] } },
  });
  await prisma.user.deleteMany({
    where: { tenantId: { in: [tenantA.tenant.id, tenantB.tenant.id] } },
  });
  await prisma.tenant.deleteMany({
    where: { id: { in: [tenantA.tenant.id, tenantB.tenant.id] } },
  });
  await prisma.$disconnect();
});

describe("event service", () => {
  it("creates an event with tenant, type, subtype, venue and thresholds", async () => {
    const result = await createEvent(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: inputFor(tenantA, { reference: "WHU-100" }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const event = await getEventForTenant(
      prisma,
      tenantA.tenant.id,
      result.id,
    );
    expect(event.tenantId).toBe(tenantA.tenant.id);
    expect(event.eventType.code).toBe("sporting");
    expect(event.eventSubtype.code).toBe("football-match");
    expect(event.venueId).toBe(tenantA.venueId);
    expect(event.staffRequired).toBe(40);
    expect(event.warningFillRate).toBe(90);
    expect(event.criticalFillRate).toBe(85);
    expect(event.createdById).toBe(tenantA.user.id);
  });

  it("rejects a subtype that does not belong to the selected type", async () => {
    const result = await createEvent(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: inputFor(tenantA, { eventSubtypeId: tenantA.otherSubtypeId }),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors?.eventSubtypeId?.[0]).toMatch(/subtype/i);
  });

  it("rejects another tenant's type, subtype or venue identifiers", async () => {
    const typeResult = await createEvent(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: inputFor(tenantA, { eventTypeId: tenantB.typeId }),
    });
    expect(typeResult.ok).toBe(false);

    const venueResult = await createEvent(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: inputFor(tenantA, { venueId: tenantB.venueId }),
    });
    expect(venueResult.ok).toBe(false);
    if (!venueResult.ok) {
      expect(venueResult.fieldErrors?.venueId?.[0]).toMatch(/valid venue/i);
    }
  });

  it("does not let one tenant read, update or delete another tenant's event", async () => {
    const created = await createEvent(prisma, {
      tenantId: tenantB.tenant.id,
      userId: tenantB.user.id,
      input: inputFor(tenantB, { name: "Private concert" }),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await expect(
      getEventForTenant(prisma, tenantA.tenant.id, created.id),
    ).rejects.toBeInstanceOf(EventAccessError);

    await expect(
      updateEvent(prisma, {
        tenantId: tenantA.tenant.id,
        userId: tenantA.user.id,
        eventId: created.id,
        input: inputFor(tenantA, { name: "Hijacked event" }),
      }),
    ).rejects.toBeInstanceOf(EventAccessError);

    await expect(
      deleteEvent(prisma, {
        tenantId: tenantA.tenant.id,
        userId: tenantA.user.id,
        eventId: created.id,
      }),
    ).rejects.toBeInstanceOf(EventAccessError);

    const original = await getEventForTenant(
      prisma,
      tenantB.tenant.id,
      created.id,
    );
    expect(original.name).toBe("Private concert");
    expect(original.deletedAt).toBeNull();
  });

  it("logically deletes an event and hides it from list and get", async () => {
    const created = await createEvent(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: inputFor(tenantA, { name: "To be deleted", reference: "DEL-1" }),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await deleteEvent(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      eventId: created.id,
    });

    const stored = await prisma.event.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(stored.deletedAt).not.toBeNull();
    expect(stored.deletedById).toBe(tenantA.user.id);

    await expect(
      getEventForTenant(prisma, tenantA.tenant.id, created.id),
    ).rejects.toBeInstanceOf(EventAccessError);

    const list = await listEventsForTenant(prisma, tenantA.tenant.id, {
      q: "To be deleted",
      status: "",
      type: "",
      range: "all",
      from: "",
      to: "",
      page: 1,
    });
    expect(list.events.some((event) => event.id === created.id)).toBe(false);
  });

  it("rejects a duplicate reference within the same tenant", async () => {
    const first = await createEvent(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: inputFor(tenantA, { reference: "DUP-9" }),
    });
    expect(first.ok).toBe(true);

    const second = await createEvent(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: inputFor(tenantA, {
        name: "Another fixture",
        reference: "DUP-9",
      }),
    });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.fieldErrors?.reference?.[0]).toMatch(/already used/i);
    }
  });

  it("reuses an existing venue when adding one inline with the same name", async () => {
    const result = await createEvent(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: inputFor(tenantA, {
        venueId: null,
        newVenueName: "Test Venue a",
        name: "Inline venue reuse",
      }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const event = await getEventForTenant(
      prisma,
      tenantA.tenant.id,
      result.id,
    );
    expect(event.venueId).toBe(tenantA.venueId);
  });
});

describe("venue service", () => {
  it("creates a venue for the tenant", async () => {
    const result = await createVenue(prisma, {
      tenantId: tenantA.tenant.id,
      input: {
        name: "Emirates Stadium",
        addressLine1: "Hornsey Road",
        townCity: "London",
        postcode: "N5 7AY",
        active: true,
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const venue = await getVenueForTenant(
      prisma,
      tenantA.tenant.id,
      result.id,
    );
    expect(venue.tenantId).toBe(tenantA.tenant.id);
    expect(venue.name).toBe("Emirates Stadium");
    expect(venue.postcode).toBe("N5 7AY");
  });

  it("rejects a duplicate venue name in the same tenant", async () => {
    const result = await createVenue(prisma, {
      tenantId: tenantA.tenant.id,
      input: {
        name: "Test Venue a",
        addressLine1: null,
        townCity: null,
        postcode: null,
        active: true,
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors?.name?.[0]).toMatch(/already exists/i);
    }
  });

  it("does not let one tenant read or update another tenant's venue", async () => {
    await expect(
      getVenueForTenant(prisma, tenantA.tenant.id, tenantB.venueId),
    ).rejects.toBeInstanceOf(EventAccessError);

    await expect(
      updateVenue(prisma, {
        tenantId: tenantA.tenant.id,
        venueId: tenantB.venueId,
        input: {
          name: "Hijacked venue",
          addressLine1: null,
          townCity: null,
          postcode: null,
          active: true,
        },
      }),
    ).rejects.toBeInstanceOf(EventAccessError);
  });
});
