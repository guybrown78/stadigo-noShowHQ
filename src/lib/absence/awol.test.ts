import { Role } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  archiveAwol,
  correctAwol,
  createAwol,
  createCancellation,
} from "@/lib/absence/service";
import {
  getAbsenceForTenant,
  listActiveAbsencesForStaff,
  listActiveAwolsForLedger,
} from "@/lib/absence/queries";
import { parseHistoryChanges } from "@/lib/absence/history";
import { defaultLedgerListQuery, type AwolInput } from "@/lib/absence/schema";
import { prisma } from "@/lib/db";
import { provisionTenantEventCatalog } from "@/lib/events/provision";
import type { EventInput } from "@/lib/events/schema";
import { createEvent } from "@/lib/events/service";
import type { StaffInput } from "@/lib/staff/schema";
import { createStaff } from "@/lib/staff/service";

const prefix = `vitest-awol-${Date.now()}`;
const nowAfterStart = new Date("2026-09-12T13:00:00.000Z"); // 14:00 BST

type Fixture = {
  tenant: { id: string };
  user: { id: string };
  typeId: string;
  subtypeId: string;
  venueId: string;
  staffId: string;
  eventId: string;
};

let tenantA: Fixture;
let tenantB: Fixture;

async function createFixture(label: string): Promise<Fixture> {
  const tenant = await prisma.tenant.create({
    data: {
      name: `Vitest AWOL ${label}`,
      slug: `${prefix}-${label}`.toLowerCase(),
      timezone: "Europe/London",
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
  const venue = await prisma.venue.create({
    data: {
      tenantId: tenant.id,
      name: `AWOL Venue ${label}`,
      nameNormalized: `awol venue ${label}`,
      timezone: "Europe/London",
      active: true,
    },
  });
  const staffInput: StaffInput = {
    staffIdNumber: `AW-${label.toUpperCase()}`,
    firstName: "Jamie",
    lastName: `Cole ${label}`,
    email: null,
    phone: null,
    department: null,
    roleTitle: "Steward",
    managerStaffId: null,
    employmentStatus: "ACTIVE",
    startDate: null,
    applyProbation: false,
    probationLengthDays: null,
    overrideProbationEndDate: false,
    probationEndDate: null,
    probationStatus: "NOT_APPLICABLE",
    securityClearanceStatus: "NOT_RECORDED",
    securityClearanceExpiryDate: null,
    notes: null,
  };
  const staff = await createStaff(prisma, {
    tenantId: tenant.id,
    userId: user.id,
    input: staffInput,
  });
  if (!staff.ok) throw new Error("Failed to create fixture staff");
  const eventInput: EventInput = {
    name: `Matchday ${label}`,
    reference: `MD-${label.toUpperCase()}`,
    eventTypeId: sporting.id,
    eventSubtypeId: sporting.subtypes[0]!.id,
    venueId: venue.id,
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
  };
  const event = await createEvent(prisma, {
    tenantId: tenant.id,
    userId: user.id,
    input: eventInput,
  });
  if (!event.ok) throw new Error("Failed to create fixture event");
  return {
    tenant,
    user,
    typeId: sporting.id,
    subtypeId: sporting.subtypes[0]!.id,
    venueId: venue.id,
    staffId: staff.id,
    eventId: event.id,
  };
}

function awolInput(
  fixture: Fixture,
  overrides: Partial<AwolInput> = {},
): AwolInput {
  return {
    type: "AWOL",
    staffId: fixture.staffId,
    eventId: fixture.eventId,
    reportedDate: "2026-09-12",
    notes: null,
    sameDayStartUnknownConfirmed: false,
    idempotencyKey: `key-${Math.random().toString(36).slice(2, 12)}`,
    ...overrides,
  };
}

async function addEvent(
  fixture: Fixture,
  data: { name: string; reference: string | null; eventDate: string; startTime?: string | null },
) {
  const result = await createEvent(prisma, {
    tenantId: fixture.tenant.id,
    userId: fixture.user.id,
    input: {
      name: data.name,
      reference: data.reference,
      eventTypeId: fixture.typeId,
      eventSubtypeId: fixture.subtypeId,
      venueId: fixture.venueId,
      newVenueName: null,
      newVenueAddressLine1: null,
      newVenueTownCity: null,
      newVenuePostcode: null,
      eventDate: data.eventDate,
      briefingTime: null,
      startTime: data.startTime ?? "14:00",
      endTime: "17:00",
      endsNextDay: false,
      staffRequired: 10,
      warningFillRate: 90,
      criticalFillRate: 85,
      status: "PLANNED",
      notes: null,
    },
  });
  if (!result.ok) throw new Error(result.error);
  return result;
}

beforeAll(async () => {
  tenantA = await createFixture("a");
  tenantB = await createFixture("b");
});

afterAll(async () => {
  const tenantIds = [tenantA?.tenant.id, tenantB?.tenant.id].filter(Boolean);
  await prisma.absenceIdempotencyKey.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
  await prisma.absenceHistory.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
  await prisma.awolDetail.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
  await prisma.cancellationDetail.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
  await prisma.absence.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.event.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.venue.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.eventSubtype.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
  await prisma.eventType.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
  await prisma.staffProbationTask.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
  await prisma.staffProbationHistory.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
  await prisma.staffProbation.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
  await prisma.staff.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  await prisma.$disconnect();
});

describe("AWOL service", () => {
  it("creates parent, snapshots and a Created audit entry atomically", async () => {
    const result = await createAwol(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: awolInput(tenantA, { notes: "No contact" }),
      now: nowAfterStart,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const absence = await getAbsenceForTenant(
      prisma,
      tenantA.tenant.id,
      result.id,
    );
    expect(absence.type).toBe("AWOL");
    expect(absence.reason).toBeNull();
    expect(absence.notes).toBe("No contact");
    expect(absence.awol?.eventNameSnapshot).toBe("Matchday a");
    expect(absence.awol?.eventReferenceSnapshot).toBe("MD-A");
    expect(absence.awol?.eventTypeSnapshot).toBeTruthy();
    expect(absence.history[0]?.action).toBe("CREATED");

    const staff = await prisma.staff.findUniqueOrThrow({
      where: { id: tenantA.staffId },
    });
    expect(staff.employmentStatus).toBe("ACTIVE");
  });

  it("returns null notes from the parent Absence without inventing a value", async () => {
    const event = await addEvent(tenantA, {
      name: "Blank Notes Cup",
      reference: "BN-1",
      eventDate: "2026-09-01",
    });
    const result = await createAwol(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: awolInput(tenantA, {
        eventId: event.id,
        reportedDate: "2026-09-10",
        notes: null,
      }),
      now: nowAfterStart,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const absence = await getAbsenceForTenant(
      prisma,
      tenantA.tenant.id,
      result.id,
    );
    expect(absence.notes).toBeNull();
    expect(absence.reason).toBeNull();
  });

  it("replays an identical idempotency key without a second record", async () => {
    const event = await addEvent(tenantA, {
      name: "Replay Cup",
      reference: "RP-1",
      eventDate: "2026-09-01",
    });
    const input = awolInput(tenantA, {
      eventId: event.id,
      reportedDate: "2026-09-10",
      idempotencyKey: "replay-key-1234",
    });
    const first = await createAwol(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input,
      now: nowAfterStart,
    });
    const second = await createAwol(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input,
      now: nowAfterStart,
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.id).toBe(first.id);
    const count = await prisma.absence.count({
      where: { tenantId: tenantA.tenant.id, eventId: event.id, type: "AWOL" },
    });
    expect(count).toBe(1);
  });

  it("rejects reusing an idempotency key with a different payload", async () => {
    const event = await addEvent(tenantA, {
      name: "Reuse Cup",
      reference: "RU-1",
      eventDate: "2026-09-01",
    });
    const key = "reuse-key-5678";
    const first = await createAwol(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: awolInput(tenantA, {
        eventId: event.id,
        reportedDate: "2026-09-10",
        idempotencyKey: key,
      }),
      now: nowAfterStart,
    });
    expect(first.ok).toBe(true);
    const second = await createAwol(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: awolInput(tenantA, {
        eventId: event.id,
        reportedDate: "2026-09-11",
        idempotencyKey: key,
      }),
      now: nowAfterStart,
    });
    expect(second.ok).toBe(false);
  });

  it("blocks a second active AWOL and an active Cancellation for the same staff and event", async () => {
    const event = await addEvent(tenantA, {
      name: "Conflict Cup",
      reference: "CF-1",
      eventDate: "2026-09-01",
    });
    const first = await createAwol(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: awolInput(tenantA, {
        eventId: event.id,
        reportedDate: "2026-09-10",
      }),
      now: nowAfterStart,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const duplicate = await createAwol(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: awolInput(tenantA, {
        eventId: event.id,
        reportedDate: "2026-09-10",
      }),
      now: nowAfterStart,
    });
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) {
      expect(duplicate.existingAbsenceId).toBe(first.id);
    }

    const cancellation = await createCancellation(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: {
        type: "CANCELLATION",
        staffId: tenantA.staffId,
        eventId: event.id,
        reportedDate: "2026-08-30",
        reportedTime: null,
        reason: "Called in",
        notes: null,
        retrospectiveConfirmed: false,
      },
    });
    expect(cancellation.ok).toBe(false);
    if (!cancellation.ok) {
      expect(cancellation.existingAbsenceId).toBe(first.id);
    }
  });

  it("allows a replacement after archive and writes correction history", async () => {
    const event = await addEvent(tenantA, {
      name: "Archive Cup",
      reference: "AR-1",
      eventDate: "2026-09-01",
    });
    const created = await createAwol(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: awolInput(tenantA, {
        eventId: event.id,
        reportedDate: "2026-09-10",
        notes: "First",
      }),
      now: nowAfterStart,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const current = await getAbsenceForTenant(
      prisma,
      tenantA.tenant.id,
      created.id,
    );
    const corrected = await correctAwol(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      absenceId: created.id,
      now: nowAfterStart,
      input: {
        type: "AWOL",
        staffId: tenantA.staffId,
        eventId: event.id,
        reportedDate: "2026-09-10",
        notes: "Updated notes",
        sameDayStartUnknownConfirmed: false,
        correctionReason: "Typo in notes",
        expectedUpdatedAt: current.updatedAt.toISOString(),
      },
    });
    expect(corrected.ok).toBe(true);

    const afterCorrect = await getAbsenceForTenant(
      prisma,
      tenantA.tenant.id,
      created.id,
    );
    expect(afterCorrect.notes).toBe("Updated notes");
    const createdNotes = afterCorrect.history
      .flatMap((entry) =>
        parseHistoryChanges(entry.changes).map((change) => ({
          action: entry.action,
          ...change,
        })),
      )
      .filter((change) => change.field === "notes");
    expect(createdNotes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "CREATED",
          previous: null,
          next: "First",
        }),
        expect.objectContaining({
          action: "CORRECTED",
          previous: "First",
          next: "Updated notes",
        }),
      ]),
    );

    const archived = await archiveAwol(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      absenceId: created.id,
      input: {
        archiveReason: "Logged against the wrong event",
        confirmArchive: true,
        expectedUpdatedAt: afterCorrect.updatedAt.toISOString(),
      },
    });
    expect(archived.ok).toBe(true);
    const archivedRecord = await getAbsenceForTenant(
      prisma,
      tenantA.tenant.id,
      created.id,
    );
    expect(archivedRecord.recordStatus).toBe("ARCHIVED");
    expect(archivedRecord.notes).toBe("Updated notes");

    const history = await listActiveAbsencesForStaff(
      prisma,
      tenantA.tenant.id,
      tenantA.staffId,
    );
    expect(history.absences.some((row) => row.id === created.id)).toBe(false);

    const replacement = await createAwol(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: awolInput(tenantA, {
        eventId: event.id,
        reportedDate: "2026-09-11",
      }),
      now: nowAfterStart,
    });
    expect(replacement.ok).toBe(true);
  });

  it("rejects a stale correction", async () => {
    const event = await addEvent(tenantA, {
      name: "Stale Cup",
      reference: "ST-1",
      eventDate: "2026-09-01",
    });
    const created = await createAwol(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: awolInput(tenantA, {
        eventId: event.id,
        reportedDate: "2026-09-10",
      }),
      now: nowAfterStart,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const stale = await correctAwol(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      absenceId: created.id,
      now: nowAfterStart,
      input: {
        type: "AWOL",
        staffId: tenantA.staffId,
        eventId: event.id,
        reportedDate: "2026-09-10",
        notes: "stale",
        sameDayStartUnknownConfirmed: false,
        correctionReason: "Trying a stale write",
        expectedUpdatedAt: new Date("2020-01-01T00:00:00.000Z").toISOString(),
      },
    });
    expect(stale.ok).toBe(false);
  });

  it("lets only one concurrent archive succeed", async () => {
    const event = await addEvent(tenantA, {
      name: "Archive Race",
      reference: "AR-R",
      eventDate: "2026-09-01",
    });
    const created = await createAwol(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: awolInput(tenantA, {
        eventId: event.id,
        reportedDate: "2026-09-10",
      }),
      now: nowAfterStart,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const current = await getAbsenceForTenant(
      prisma,
      tenantA.tenant.id,
      created.id,
    );
    const input = {
      archiveReason: "Duplicate archive attempt",
      confirmArchive: true as const,
      expectedUpdatedAt: current.updatedAt.toISOString(),
    };
    const [first, second] = await Promise.all([
      archiveAwol(prisma, {
        tenantId: tenantA.tenant.id,
        userId: tenantA.user.id,
        absenceId: created.id,
        input,
      }),
      archiveAwol(prisma, {
        tenantId: tenantA.tenant.id,
        userId: tenantA.user.id,
        absenceId: created.id,
        input,
      }),
    ]);
    expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1);
  });

  it("rejects a future Event and a Date recorded before the Event date", async () => {
    const future = await addEvent(tenantA, {
      name: "Future Cup",
      reference: "FU-1",
      eventDate: "2026-12-01",
    });
    const futureResult = await createAwol(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: awolInput(tenantA, {
        eventId: future.id,
        reportedDate: "2026-09-12",
      }),
      now: nowAfterStart,
    });
    expect(futureResult.ok).toBe(false);
    expect(
      await prisma.absence.count({
        where: { tenantId: tenantA.tenant.id, eventId: future.id },
      }),
    ).toBe(0);

    const past = await addEvent(tenantA, {
      name: "Past Cup",
      reference: "PA-1",
      eventDate: "2026-09-01",
    });
    const earlyDate = await createAwol(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: awolInput(tenantA, {
        eventId: past.id,
        reportedDate: "2026-08-31",
      }),
      now: nowAfterStart,
    });
    expect(earlyDate.ok).toBe(false);
  });

  it("does not leak another tenant's AWOL", async () => {
    const created = await createAwol(prisma, {
      tenantId: tenantB.tenant.id,
      userId: tenantB.user.id,
      input: awolInput(tenantB, { reportedDate: "2026-09-12" }),
      now: nowAfterStart,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await expect(
      getAbsenceForTenant(prisma, tenantA.tenant.id, created.id),
    ).rejects.toMatchObject({
      name: "AbsenceAccessError",
      message: "Not found",
    });

    const list = await listActiveAwolsForLedger(
      prisma,
      tenantA.tenant.id,
      defaultLedgerListQuery("awol"),
    );
    expect(list.rows.some((row) => row.id === created.id)).toBe(false);
  });

  it("lists active AWOL ledger rows from snapshots and excludes Cancellations", async () => {
    const event = await addEvent(tenantA, {
      name: "Ledger Cup",
      reference: "LD-1",
      eventDate: "2026-08-20",
    });
    const created = await createAwol(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: awolInput(tenantA, {
        eventId: event.id,
        reportedDate: "2026-08-21",
        notes: "Preview notes",
      }),
      now: nowAfterStart,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const list = await listActiveAwolsForLedger(prisma, tenantA.tenant.id, {
      ...defaultLedgerListQuery("awol"),
      q: "Ledger Cup",
    });
    expect(list.rows.some((row) => row.id === created.id)).toBe(true);
    expect(list.rows.every((row) => row.type === "AWOL")).toBe(true);
    expect(list.rows.find((row) => row.id === created.id)?.awol?.eventNameSnapshot).toBe(
      "Ledger Cup",
    );

    await prisma.event.update({
      where: { id: event.id },
      data: { name: "Renamed Live Cup" },
    });
    const stillSnapshot = await listActiveAwolsForLedger(
      prisma,
      tenantA.tenant.id,
      { ...defaultLedgerListQuery("awol"), q: "Ledger Cup" },
    );
    expect(stillSnapshot.rows.some((row) => row.id === created.id)).toBe(true);
    const liveName = await listActiveAwolsForLedger(prisma, tenantA.tenant.id, {
      ...defaultLedgerListQuery("awol"),
      q: "Renamed Live Cup",
    });
    expect(liveName.rows.some((row) => row.id === created.id)).toBe(false);

    const notesSearch = await listActiveAwolsForLedger(
      prisma,
      tenantA.tenant.id,
      { ...defaultLedgerListQuery("awol"), q: "Preview notes" },
    );
    expect(notesSearch.rows.some((row) => row.id === created.id)).toBe(false);

    const inclusive = await listActiveAwolsForLedger(prisma, tenantA.tenant.id, {
      ...defaultLedgerListQuery("awol"),
      q: "Ledger Cup",
      eventFrom: "2026-08-20",
      eventTo: "2026-08-20",
      reportedFrom: "2026-08-21",
      reportedTo: "2026-08-21",
    });
    expect(inclusive.rows.some((row) => row.id === created.id)).toBe(true);

    const inverted = await listActiveAwolsForLedger(prisma, tenantA.tenant.id, {
      ...defaultLedgerListQuery("awol"),
      q: "Ledger Cup",
      eventFrom: "2026-08-22",
      eventTo: "2026-08-19",
    });
    expect(inverted.rows.some((row) => row.id === created.id)).toBe(true);
  });

  it("paginates AWOL ledger rows and clamps an invalid page", async () => {
    for (let i = 0; i < 26; i += 1) {
      const event = await addEvent(tenantA, {
        name: `AwolPage ${String(i).padStart(2, "0")}`,
        reference: `AWP-${i}`,
        eventDate: "2026-07-01",
      });
      const created = await createAwol(prisma, {
        tenantId: tenantA.tenant.id,
        userId: tenantA.user.id,
        input: awolInput(tenantA, {
          eventId: event.id,
          reportedDate: "2026-07-02",
        }),
        now: nowAfterStart,
      });
      if (!created.ok) throw new Error(created.error);
    }

    const page1 = await listActiveAwolsForLedger(prisma, tenantA.tenant.id, {
      ...defaultLedgerListQuery("awol"),
      q: "AwolPage",
      page: 1,
    });
    expect(page1.rows).toHaveLength(25);
    expect(page1.total).toBe(26);
    expect(page1.pageCount).toBe(2);

    const page2 = await listActiveAwolsForLedger(prisma, tenantA.tenant.id, {
      ...defaultLedgerListQuery("awol"),
      q: "AwolPage",
      page: 2,
    });
    expect(page2.rows).toHaveLength(1);
    expect(page2.page).toBe(2);

    const clamped = await listActiveAwolsForLedger(prisma, tenantA.tenant.id, {
      ...defaultLedgerListQuery("awol"),
      q: "AwolPage",
      page: 99,
    });
    expect(clamped.page).toBe(2);
    expect(clamped.rows).toHaveLength(1);
  });
});

describe("Cancellation versus AWOL slot", () => {
  it("blocks creating an AWOL when an active Cancellation occupies the slot", async () => {
    const event = await addEvent(tenantA, {
      name: "Cancel First",
      reference: "CX-1",
      eventDate: "2026-09-01",
    });
    const cancellation = await createCancellation(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: {
        type: "CANCELLATION",
        staffId: tenantA.staffId,
        eventId: event.id,
        reportedDate: "2026-08-30",
        reportedTime: null,
        reason: "Illness",
        notes: null,
        retrospectiveConfirmed: false,
      },
    });
    expect(cancellation.ok).toBe(true);
    if (!cancellation.ok) return;

    const awol = await createAwol(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: awolInput(tenantA, {
        eventId: event.id,
        reportedDate: "2026-09-10",
      }),
      now: nowAfterStart,
    });
    expect(awol.ok).toBe(false);
  });

  it("lets the unique index admit only one winner for concurrent AWOL and Cancellation writes", async () => {
    const event = await addEvent(tenantA, {
      name: "Race Cup",
      reference: "RC-1",
      eventDate: "2026-09-01",
    });
    const [awol, cancellation] = await Promise.all([
      createAwol(prisma, {
        tenantId: tenantA.tenant.id,
        userId: tenantA.user.id,
        input: awolInput(tenantA, {
          eventId: event.id,
          reportedDate: "2026-09-10",
        }),
        now: nowAfterStart,
      }),
      createCancellation(prisma, {
        tenantId: tenantA.tenant.id,
        userId: tenantA.user.id,
        input: {
          type: "CANCELLATION",
          staffId: tenantA.staffId,
          eventId: event.id,
          reportedDate: "2026-08-30",
          reportedTime: null,
          reason: "Called in",
          notes: null,
          retrospectiveConfirmed: false,
        },
      }),
    ]);
    expect([awol.ok, cancellation.ok].filter(Boolean)).toHaveLength(1);
    const active = await prisma.absence.count({
      where: {
        tenantId: tenantA.tenant.id,
        eventId: event.id,
        recordStatus: "ACTIVE",
        type: { in: ["AWOL", "CANCELLATION"] },
      },
    });
    expect(active).toBe(1);
  });
});
