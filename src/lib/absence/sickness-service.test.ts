import { Role } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  archiveSickness,
  correctSickness,
  createCancellation,
  createSickness,
} from "@/lib/absence/service";
import {
  getAbsenceForTenant,
  listActiveAbsencesForStaff,
} from "@/lib/absence/queries";
import { parseHistoryChanges } from "@/lib/absence/history";
import { redactHistoryChangesForPublicFeed } from "@/lib/absence/sensitive";
import type { SicknessInput } from "@/lib/absence/schema";
import { prisma } from "@/lib/db";
import { provisionTenantEventCatalog } from "@/lib/events/provision";
import type { EventInput } from "@/lib/events/schema";
import { createEvent } from "@/lib/events/service";
import type { StaffInput } from "@/lib/staff/schema";
import { createStaff } from "@/lib/staff/service";

const prefix = `vitest-sickness-${Date.now()}`;
const now = new Date("2026-09-14T12:00:00.000Z");

type Fixture = {
  tenant: { id: string };
  user: { id: string };
  typeId: string;
  subtypeId: string;
  venueId: string;
  staffId: string;
  otherStaffId: string;
  eventId: string;
};

let tenantA: Fixture;
let tenantB: Fixture;

function staffInput(label: string, staffIdNumber: string): StaffInput {
  return {
    staffIdNumber,
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
}

async function createFixture(label: string): Promise<Fixture> {
  const tenant = await prisma.tenant.create({
    data: {
      name: `Vitest Sickness ${label}`,
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
      name: `Sickness Venue ${label}`,
      nameNormalized: `sickness venue ${label}`,
      timezone: "Europe/London",
      active: true,
    },
  });
  const staff = await createStaff(prisma, {
    tenantId: tenant.id,
    userId: user.id,
    input: staffInput(label, `SK-${label.toUpperCase()}`),
  });
  if (!staff.ok) throw new Error("Failed to create fixture staff");
  const other = await createStaff(prisma, {
    tenantId: tenant.id,
    userId: user.id,
    input: staffInput(`${label}-b`, `SK-${label.toUpperCase()}-B`),
  });
  if (!other.ok) throw new Error("Failed to create second fixture staff");
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
    otherStaffId: other.id,
    eventId: event.id,
  };
}

function sicknessInput(
  fixture: Fixture,
  overrides: Partial<SicknessInput> = {},
): SicknessInput {
  return {
    type: "SICKNESS",
    staffId: fixture.staffId,
    reportedDate: "2026-09-14",
    firstWorkingDaySick: "2026-09-14",
    sicknessStartedDate: null,
    issueSummary: null,
    futureFirstWorkingDayConfirmed: false,
    idempotencyKey: `sickness-${Math.random().toString(36).slice(2)}`,
    ...overrides,
  };
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
  await prisma.sicknessDetail.deleteMany({
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
  await prisma.eventType.deleteMany({ where: { tenantId: { in: tenantIds } } });
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

describe("createSickness", () => {
  it("creates a required-fields report with no Event and explicit empty fallbacks", async () => {
    const result = await createSickness(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: sicknessInput(tenantA),
      now,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const absence = await getAbsenceForTenant(
      prisma,
      tenantA.tenant.id,
      result.id,
    );
    expect(absence.type).toBe("SICKNESS");
    expect(absence.eventId).toBeNull();
    expect(absence.reportedTime).toBeNull();
    expect(absence.reason).toBeNull();
    expect(absence.notes).toBeNull();
    expect(absence.sickness?.sicknessStartedDate).toBeNull();
    expect(absence.sickness?.issueSummary).toBeNull();
    expect(absence.history[0]?.action).toBe("CREATED");
    const staff = await prisma.staff.findUniqueOrThrow({
      where: { id: tenantA.staffId },
    });
    expect(staff.employmentStatus).toBe("ACTIVE");
  });

  it("creates a report with optional fields, line breaks, and advance acknowledgement", async () => {
    const result = await createSickness(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: sicknessInput(tenantA, {
        firstWorkingDaySick: "2026-09-15",
        sicknessStartedDate: "2026-09-14",
        issueSummary: "Unable to work\nNo cover arranged",
        futureFirstWorkingDayConfirmed: true,
      }),
      now,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const absence = await getAbsenceForTenant(
      prisma,
      tenantA.tenant.id,
      result.id,
    );
    expect(absence.sickness?.issueSummary).toBe(
      "Unable to work\nNo cover arranged",
    );
    const changes = parseHistoryChanges(absence.history[0]?.changes);
    expect(
      changes.some(
        (change) =>
          change.field === "futureFirstWorkingDayConfirmed" &&
          change.next === "2026-09-15",
      ),
    ).toBe(true);
  });

  it("accepts a retrospective report", async () => {
    const result = await createSickness(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: sicknessInput(tenantA, {
        reportedDate: "2026-09-14",
        firstWorkingDaySick: "2026-09-10",
        sicknessStartedDate: "2026-09-08",
      }),
      now,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects an unconfirmed advance report and a report beyond 31 days", async () => {
    const unconfirmed = await createSickness(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: sicknessInput(tenantA, {
        firstWorkingDaySick: "2026-09-16",
        futureFirstWorkingDayConfirmed: false,
      }),
      now,
    });
    expect(unconfirmed.ok).toBe(false);

    const beyond = await createSickness(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: sicknessInput(tenantA, {
        firstWorkingDaySick: "2027-09-14",
        futureFirstWorkingDayConfirmed: true,
      }),
      now,
    });
    expect(beyond.ok).toBe(false);
  });

  it("replays the same idempotency key and rejects a mismatched payload", async () => {
    const key = `idem-${Date.now()}`;
    const first = await createSickness(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: sicknessInput(tenantA, {
        firstWorkingDaySick: "2026-08-01",
        idempotencyKey: key,
      }),
      now,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const replay = await createSickness(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: sicknessInput(tenantA, {
        firstWorkingDaySick: "2026-08-01",
        idempotencyKey: key,
      }),
      now,
    });
    expect(replay.ok).toBe(true);
    if (replay.ok) expect(replay.id).toBe(first.id);
    const mismatch = await createSickness(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: sicknessInput(tenantA, {
        firstWorkingDaySick: "2026-08-02",
        idempotencyKey: key,
      }),
      now,
    });
    expect(mismatch.ok).toBe(false);
  });

  it("rejects a second active report for the same staff and first working day", async () => {
    const first = await createSickness(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: sicknessInput(tenantA, { firstWorkingDaySick: "2026-07-01" }),
      now,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const duplicate = await createSickness(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: sicknessInput(tenantA, { firstWorkingDaySick: "2026-07-01" }),
      now,
    });
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) {
      expect(duplicate.existingAbsenceId).toBe(first.id);
    }
  });

  it("lets concurrent duplicate creates admit only one winner", async () => {
    const [one, two] = await Promise.all([
      createSickness(prisma, {
        tenantId: tenantA.tenant.id,
        userId: tenantA.user.id,
        input: sicknessInput(tenantA, { firstWorkingDaySick: "2026-06-01" }),
        now,
      }),
      createSickness(prisma, {
        tenantId: tenantA.tenant.id,
        userId: tenantA.user.id,
        input: sicknessInput(tenantA, { firstWorkingDaySick: "2026-06-01" }),
        now,
      }),
    ]);
    expect([one.ok, two.ok].filter(Boolean)).toHaveLength(1);
    const active = await prisma.absence.count({
      where: {
        tenantId: tenantA.tenant.id,
        staffId: tenantA.staffId,
        firstWorkingDaySick: new Date("2026-06-01T00:00:00.000Z"),
        type: "SICKNESS",
        recordStatus: "ACTIVE",
      },
    });
    expect(active).toBe(1);
  });

  it("coexists with Cancellation and AWOL for the same staff", async () => {
    const cancellation = await createCancellation(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: {
        type: "CANCELLATION",
        staffId: tenantA.staffId,
        eventId: tenantA.eventId,
        reportedDate: "2026-09-10",
        reportedTime: null,
        reason: "Called in",
        notes: null,
        retrospectiveConfirmed: false,
      },
    });
    expect(cancellation.ok).toBe(true);
    const sickness = await createSickness(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: sicknessInput(tenantA, { firstWorkingDaySick: "2026-05-01" }),
      now,
    });
    expect(sickness.ok).toBe(true);
  });

  it("does not leak a cross-tenant duplicate", async () => {
    const inA = await createSickness(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: sicknessInput(tenantA, { firstWorkingDaySick: "2026-04-01" }),
      now,
    });
    expect(inA.ok).toBe(true);
    const inB = await createSickness(prisma, {
      tenantId: tenantB.tenant.id,
      userId: tenantB.user.id,
      input: sicknessInput(tenantB, { firstWorkingDaySick: "2026-04-01" }),
      now,
    });
    expect(inB.ok).toBe(true);
    await expect(
      getAbsenceForTenant(prisma, tenantB.tenant.id, inA.ok ? inA.id : ""),
    ).rejects.toThrow();
  });

  it("enforces the type-aware Event check", async () => {
    await expect(
      prisma.absence.create({
        data: {
          tenantId: tenantA.tenant.id,
          staffId: tenantA.staffId,
          type: "CANCELLATION",
          reportedDate: new Date("2026-09-14T00:00:00.000Z"),
          followUpType: "REVIEW",
          followUpStatus: "PENDING",
          createdById: tenantA.user.id,
          updatedById: tenantA.user.id,
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.absence.create({
        data: {
          tenantId: tenantA.tenant.id,
          staffId: tenantA.staffId,
          eventId: tenantA.eventId,
          type: "SICKNESS",
          reportedDate: new Date("2026-09-14T00:00:00.000Z"),
          followUpType: "REVIEW",
          followUpStatus: "PENDING",
          createdById: tenantA.user.id,
          updatedById: tenantA.user.id,
        },
      }),
    ).rejects.toThrow();
  });

  it("reports that existing Cancellation and AWOL rows all have an Event", async () => {
    const missing = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count
      FROM "Absence"
      WHERE "type" IN ('CANCELLATION', 'AWOL')
        AND "eventId" IS NULL
    `;
    expect(Number(missing[0]?.count ?? 1)).toBe(0);
  });
});

describe("correctSickness and archiveSickness", () => {
  it("corrects fields, audits old and new values, and moves staff history", async () => {
    const created = await createSickness(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: sicknessInput(tenantA, { firstWorkingDaySick: "2026-03-01" }),
      now,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const existing = await getAbsenceForTenant(
      prisma,
      tenantA.tenant.id,
      created.id,
    );
    const corrected = await correctSickness(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      absenceId: created.id,
      now,
      input: {
        type: "SICKNESS",
        staffId: tenantA.otherStaffId,
        reportedDate: "2026-09-13",
        firstWorkingDaySick: "2026-03-02",
        sicknessStartedDate: "2026-03-01",
        issueSummary: "Updated summary",
        futureFirstWorkingDayConfirmed: false,
        correctionReason: "Wrong staff and dates",
        expectedUpdatedAt: existing.updatedAt.toISOString(),
      },
    });
    expect(corrected.ok).toBe(true);
    const updated = await getAbsenceForTenant(
      prisma,
      tenantA.tenant.id,
      created.id,
    );
    expect(updated.staffId).toBe(tenantA.otherStaffId);
    const correction = updated.history.find((row) => row.action === "CORRECTED");
    const changes = parseHistoryChanges(correction?.changes);
    expect(changes.some((change) => change.field === "staffId")).toBe(true);
    expect(changes.some((change) => change.field === "issueSummary")).toBe(
      true,
    );
    const publicFeed = redactHistoryChangesForPublicFeed(changes);
    expect(
      publicFeed.find((change) => change.field === "issueSummary")?.next,
    ).toBe("Issue summary changed");
    const oldHistory = await listActiveAbsencesForStaff(
      prisma,
      tenantA.tenant.id,
      tenantA.staffId,
    );
    expect(oldHistory.absences.some((row) => row.id === created.id)).toBe(
      false,
    );
    const newHistory = await listActiveAbsencesForStaff(
      prisma,
      tenantA.tenant.id,
      tenantA.otherStaffId,
    );
    expect(newHistory.absences.some((row) => row.id === created.id)).toBe(true);
    expect(
      newHistory.absences.find((row) => row.id === created.id)?.sickness
        ?.issueSummaryPresent,
    ).toBe(true);
    expect(
      JSON.stringify(
        newHistory.absences.find((row) => row.id === created.id)?.sickness,
      ),
    ).not.toContain("Updated summary");
  });

  it("rejects a no-change correction and a stale write", async () => {
    const created = await createSickness(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: sicknessInput(tenantA, { firstWorkingDaySick: "2026-02-01" }),
      now,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const existing = await getAbsenceForTenant(
      prisma,
      tenantA.tenant.id,
      created.id,
    );
    const noChange = await correctSickness(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      absenceId: created.id,
      now,
      input: {
        type: "SICKNESS",
        staffId: tenantA.staffId,
        reportedDate: "2026-09-14",
        firstWorkingDaySick: "2026-02-01",
        sicknessStartedDate: null,
        issueSummary: null,
        futureFirstWorkingDayConfirmed: false,
        correctionReason: "No actual change",
        expectedUpdatedAt: existing.updatedAt.toISOString(),
      },
    });
    expect(noChange.ok).toBe(false);
    const stale = await correctSickness(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      absenceId: created.id,
      now,
      input: {
        type: "SICKNESS",
        staffId: tenantA.staffId,
        reportedDate: "2026-09-13",
        firstWorkingDaySick: "2026-02-01",
        sicknessStartedDate: null,
        issueSummary: null,
        futureFirstWorkingDayConfirmed: false,
        correctionReason: "Stale attempt",
        expectedUpdatedAt: "2000-01-01T00:00:00.000Z",
      },
    });
    expect(stale.ok).toBe(false);
  });

  it("archives logically, hides from default history, and frees the duplicate key", async () => {
    const created = await createSickness(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: sicknessInput(tenantA, { firstWorkingDaySick: "2026-01-01" }),
      now,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const existing = await getAbsenceForTenant(
      prisma,
      tenantA.tenant.id,
      created.id,
    );
    const archived = await archiveSickness(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      absenceId: created.id,
      input: {
        archiveReason: "Entered against the wrong person",
        confirmArchive: true,
        expectedUpdatedAt: existing.updatedAt.toISOString(),
      },
    });
    expect(archived.ok).toBe(true);
    const repeat = await archiveSickness(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      absenceId: created.id,
      input: {
        archiveReason: "Entered against the wrong person",
        confirmArchive: true,
        expectedUpdatedAt: existing.updatedAt.toISOString(),
      },
    });
    expect(repeat.ok).toBe(false);
    const activeHistory = await listActiveAbsencesForStaff(
      prisma,
      tenantA.tenant.id,
      tenantA.staffId,
    );
    expect(activeHistory.absences.some((row) => row.id === created.id)).toBe(
      false,
    );
    const withArchived = await listActiveAbsencesForStaff(
      prisma,
      tenantA.tenant.id,
      tenantA.staffId,
      1,
      { includeArchivedSickness: true },
    );
    const archivedPages = await Promise.all(
      Array.from({ length: withArchived.pageCount }, (_, index) =>
        listActiveAbsencesForStaff(
          prisma,
          tenantA.tenant.id,
          tenantA.staffId,
          index + 1,
          { includeArchivedSickness: true },
        ),
      ),
    );
    expect(
      archivedPages.some((page) =>
        page.absences.some((row) => row.id === created.id),
      ),
    ).toBe(true);
    const replacement = await createSickness(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: sicknessInput(tenantA, { firstWorkingDaySick: "2026-01-01" }),
      now,
    });
    expect(replacement.ok).toBe(true);
    const stillThere = await getAbsenceForTenant(
      prisma,
      tenantA.tenant.id,
      created.id,
    );
    expect(stillThere.recordStatus).toBe("ARCHIVED");
    expect(stillThere.sickness?.firstWorkingDaySick).toBeTruthy();
  });
});
