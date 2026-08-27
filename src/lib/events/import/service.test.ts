import { EventImportStatus, Role } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { EventAccessError } from "@/lib/events/errors";
import { EVENT_IMPORT_HEADERS } from "@/lib/events/import/constants";
import {
  getImportForTenant,
  getImportSummaryForTenant,
} from "@/lib/events/import/queries";
import {
  confirmImportEvents,
  confirmImportVenues,
  createImportFromUpload,
} from "@/lib/events/import/service";
import { buildEventImportTemplate } from "@/lib/events/import/template";
import type { ImportRowRaw } from "@/lib/events/import/types";
import { parseImportFile } from "@/lib/events/import/parse";
import { provisionTenantEventCatalog } from "@/lib/events/provision";

const prefix = `vitest-import-${Date.now()}`;

type Fixture = {
  tenant: { id: string; name: string; slug: string };
  user: { id: string };
  venueId: string;
  venueName: string;
};

let tenantA: Fixture;
let tenantB: Fixture;

async function createFixture(label: string): Promise<Fixture> {
  const tenant = await prisma.tenant.create({
    data: {
      name: `Vitest Import ${label}`,
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
  const venue = await prisma.venue.create({
    data: {
      tenantId: tenant.id,
      name: `Existing Venue ${label}`,
      nameNormalized: `existing venue ${label}`,
      timezone: "Europe/London",
      active: true,
    },
  });
  return {
    tenant,
    user,
    venueId: venue.id,
    venueName: venue.name,
  };
}

function csvFromRows(rows: Array<Partial<ImportRowRaw>>): Uint8Array {
  const lines = [
    EVENT_IMPORT_HEADERS.join(","),
    ...rows.map((row) =>
      EVENT_IMPORT_HEADERS.map((header) => {
        const value = row[header] ?? "";
        if (/[",\n]/.test(value)) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(","),
    ),
  ];
  return new TextEncoder().encode(`${lines.join("\n")}\n`);
}

function validRow(
  fixture: Fixture,
  overrides: Partial<ImportRowRaw> = {},
): Partial<ImportRowRaw> {
  return {
    "Event Name": `Imported ${fixture.tenant.slug}`,
    "Event Type": "Sporting",
    "Event Subtype": "Football Match",
    "Venue Name": fixture.venueName,
    "Event Date": "2026-10-01",
    "Staff Required": "25",
    ...overrides,
  };
}

beforeAll(async () => {
  tenantA = await createFixture("a");
  tenantB = await createFixture("b");
});

afterAll(async () => {
  const tenantIds = [tenantA.tenant.id, tenantB.tenant.id];
  await prisma.eventImport.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
  await prisma.event.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
  await prisma.venue.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
  await prisma.eventSubtype.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
  await prisma.eventType.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
  await prisma.user.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
  await prisma.tenant.deleteMany({
    where: { id: { in: tenantIds } },
  });
  await prisma.$disconnect();
});

describe("event import service", () => {
  it("creates a template that the importer can parse", async () => {
    const types = await prisma.eventType.findMany({
      where: { tenantId: tenantA.tenant.id, active: true },
      include: { subtypes: { where: { active: true } } },
    });
    const buffer = await buildEventImportTemplate(
      types.map((type) => ({
        name: type.name,
        subtypes: type.subtypes.map((subtype) => ({ name: subtype.name })),
      })),
    );
    const parsed = await parseImportFile("noshowhq-events-import.xlsx", buffer);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rows.every((row) => row.empty)).toBe(true);
  });

  it("imports valid rows after venue confirmation, including a new venue", async () => {
    const bytes = csvFromRows([
      validRow(tenantA, {
        "Event Name": "New ground fixture",
        "Venue Name": "Brand New Arena",
        "Venue Town/City": "London",
        "Venue Postcode": "e20 2st",
        Reference: "IMP-NEW-1",
      }),
    ]);
    const uploaded = await createImportFromUpload(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      fileName: "season.csv",
      bytes,
    });
    expect(uploaded.ok).toBe(true);
    if (!uploaded.ok) return;
    const beforeEvents = await prisma.event.count({
      where: { tenantId: tenantA.tenant.id },
    });
    const beforeVenues = await prisma.venue.count({
      where: { tenantId: tenantA.tenant.id },
    });

    const venues = await confirmImportVenues(prisma, {
      tenantId: tenantA.tenant.id,
      importId: uploaded.importId,
    });
    expect(venues.ok).toBe(true);
    const afterVenueEvents = await prisma.event.count({
      where: { tenantId: tenantA.tenant.id },
    });
    expect(afterVenueEvents).toBe(beforeEvents);
    const afterVenues = await prisma.venue.count({
      where: { tenantId: tenantA.tenant.id },
    });
    expect(afterVenues).toBe(beforeVenues + 1);

    const created = await confirmImportEvents(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      importId: uploaded.importId,
    });
    expect(created.ok).toBe(true);

    const record = await getImportForTenant(
      prisma,
      tenantA.tenant.id,
      uploaded.importId,
    );
    expect(record.status).toBe(EventImportStatus.COMPLETED);
    expect(record.createdEventCount).toBe(1);
    expect(record.createdVenueCount).toBe(1);
    const event = await prisma.event.findFirstOrThrow({
      where: { tenantId: tenantA.tenant.id, reference: "IMP-NEW-1" },
      include: { venue: true },
    });
    expect(event.venue.name).toBe("Brand New Arena");
    expect(event.venue.postcode).toBe("E20 2ST");
    expect(event.warningFillRate).toBe(90);
    expect(event.criticalFillRate).toBe(85);
    expect(event.status).toBe("PLANNED");
  });

  it("requires confirmation even when all venues already exist", async () => {
    const bytes = csvFromRows([
      validRow(tenantA, {
        "Event Name": "Existing venue fixture",
        Reference: "IMP-EXIST-1",
      }),
    ]);
    const uploaded = await createImportFromUpload(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      fileName: "existing.csv",
      bytes,
    });
    expect(uploaded.ok).toBe(true);
    if (!uploaded.ok) return;
    const record = await getImportSummaryForTenant(
      prisma,
      tenantA.tenant.id,
      uploaded.importId,
    );
    expect(record.status).toBe(EventImportStatus.AWAITING_VENUE_CONFIRMATION);
    expect(record.newVenueCount).toBe(0);
    expect(record.matchedVenueCount).toBe(1);

    const before = await prisma.event.count({
      where: { tenantId: tenantA.tenant.id, reference: "IMP-EXIST-1" },
    });
    expect(before).toBe(0);

    await confirmImportVenues(prisma, {
      tenantId: tenantA.tenant.id,
      importId: uploaded.importId,
    });
    const stillMissing = await prisma.event.count({
      where: { tenantId: tenantA.tenant.id, reference: "IMP-EXIST-1" },
    });
    expect(stillMissing).toBe(0);

    const created = await confirmImportEvents(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      importId: uploaded.importId,
    });
    expect(created.ok).toBe(true);
    const event = await prisma.event.findFirstOrThrow({
      where: { tenantId: tenantA.tenant.id, reference: "IMP-EXIST-1" },
    });
    expect(event.venueId).toBe(tenantA.venueId);
  });

  it("does not create venues or events when a row is invalid", async () => {
    const bytes = csvFromRows([
      validRow(tenantA, { "Event Name": "Good row", Reference: "IMP-BLOCK-1" }),
      validRow(tenantA, { "Event Name": "X", "Event Date": "not-a-date" }),
    ]);
    const beforeEvents = await prisma.event.count({
      where: { tenantId: tenantA.tenant.id },
    });
    const beforeVenues = await prisma.venue.count({
      where: { tenantId: tenantA.tenant.id },
    });
    const uploaded = await createImportFromUpload(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      fileName: "invalid.csv",
      bytes,
    });
    expect(uploaded.ok).toBe(true);
    if (!uploaded.ok) return;
    const record = await getImportSummaryForTenant(
      prisma,
      tenantA.tenant.id,
      uploaded.importId,
    );
    expect(record.status).toBe(EventImportStatus.VALIDATION_FAILED);
    expect(record.invalidRows).toBeGreaterThan(0);

    const confirmed = await confirmImportVenues(prisma, {
      tenantId: tenantA.tenant.id,
      importId: uploaded.importId,
    });
    expect(confirmed.ok).toBe(false);
    expect(await prisma.event.count({ where: { tenantId: tenantA.tenant.id } })).toBe(
      beforeEvents,
    );
    expect(await prisma.venue.count({ where: { tenantId: tenantA.tenant.id } })).toBe(
      beforeVenues,
    );
  });

  it("detects a duplicate reference against an existing event", async () => {
    const bytes = csvFromRows([
      validRow(tenantA, {
        "Event Name": "Dup ref row",
        Reference: "IMP-EXIST-1",
      }),
    ]);
    const uploaded = await createImportFromUpload(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      fileName: "dup-ref.csv",
      bytes,
    });
    expect(uploaded.ok).toBe(true);
    if (!uploaded.ok) return;
    const record = await getImportSummaryForTenant(
      prisma,
      tenantA.tenant.id,
      uploaded.importId,
    );
    expect(record.status).toBe(EventImportStatus.VALIDATION_FAILED);
    expect(record.duplicateEventCount).toBeGreaterThan(0);
  });

  it("does not create events twice when the final confirm is retried", async () => {
    const bytes = csvFromRows([
      validRow(tenantA, {
        "Event Name": "Idempotent fixture",
        Reference: "IMP-IDEM-1",
        "Event Date": "2026-11-01",
      }),
    ]);
    const uploaded = await createImportFromUpload(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      fileName: "idempotent.csv",
      bytes,
    });
    expect(uploaded.ok).toBe(true);
    if (!uploaded.ok) return;
    await confirmImportVenues(prisma, {
      tenantId: tenantA.tenant.id,
      importId: uploaded.importId,
    });
    const first = await confirmImportEvents(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      importId: uploaded.importId,
    });
    const second = await confirmImportEvents(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      importId: uploaded.importId,
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    const count = await prisma.event.count({
      where: { tenantId: tenantA.tenant.id, reference: "IMP-IDEM-1" },
    });
    expect(count).toBe(1);
  });

  it("does not let one tenant read or confirm another tenant's import", async () => {
    const bytes = csvFromRows([
      validRow(tenantB, {
        "Event Name": "Private import",
        Reference: "IMP-B-1",
      }),
    ]);
    const uploaded = await createImportFromUpload(prisma, {
      tenantId: tenantB.tenant.id,
      userId: tenantB.user.id,
      fileName: "private.csv",
      bytes,
    });
    expect(uploaded.ok).toBe(true);
    if (!uploaded.ok) return;

    await expect(
      getImportForTenant(prisma, tenantA.tenant.id, uploaded.importId),
    ).rejects.toBeInstanceOf(EventAccessError);

    await expect(
      confirmImportVenues(prisma, {
        tenantId: tenantA.tenant.id,
        importId: uploaded.importId,
      }),
    ).rejects.toBeInstanceOf(EventAccessError);

    await expect(
      confirmImportEvents(prisma, {
        tenantId: tenantA.tenant.id,
        userId: tenantA.user.id,
        importId: uploaded.importId,
      }),
    ).rejects.toBeInstanceOf(EventAccessError);

    const stillOpen = await getImportSummaryForTenant(
      prisma,
      tenantB.tenant.id,
      uploaded.importId,
    );
    expect(stillOpen.status).toBe(EventImportStatus.AWAITING_VENUE_CONFIRMATION);
    expect(
      await prisma.event.count({
        where: { tenantId: tenantB.tenant.id, reference: "IMP-B-1" },
      }),
    ).toBe(0);
  });

  it("rolls back the event batch when create fails after venue confirmation", async () => {
    const bytes = csvFromRows([
      validRow(tenantA, {
        "Event Name": "Rollback fixture",
        Reference: "IMP-ROLL-1",
        "Event Date": "2026-12-01",
      }),
    ]);
    const uploaded = await createImportFromUpload(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      fileName: "rollback.csv",
      bytes,
    });
    expect(uploaded.ok).toBe(true);
    if (!uploaded.ok) return;
    await confirmImportVenues(prisma, {
      tenantId: tenantA.tenant.id,
      importId: uploaded.importId,
    });
    await prisma.eventImportRow.updateMany({
      where: { importId: uploaded.importId },
      data: { eventTypeId: "missing-type" },
    });
    const before = await prisma.event.count({
      where: { tenantId: tenantA.tenant.id, reference: "IMP-ROLL-1" },
    });
    const result = await confirmImportEvents(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      importId: uploaded.importId,
    });
    expect(result.ok).toBe(false);
    const after = await prisma.event.count({
      where: { tenantId: tenantA.tenant.id, reference: "IMP-ROLL-1" },
    });
    expect(after).toBe(before);
  });
});
