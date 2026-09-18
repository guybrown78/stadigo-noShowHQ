import { Role } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  archiveSickness,
  createAwol,
  createCancellation,
  createSickness,
} from "@/lib/absence/service";
import { listSicknessForLedger } from "@/lib/absence/queries";
import {
  defaultLedgerListQuery,
  type AwolInput,
  type LedgerListQuery,
  type SicknessInput,
} from "@/lib/absence/schema";
import { prisma } from "@/lib/db";
import { provisionTenantEventCatalog } from "@/lib/events/provision";
import type { EventInput } from "@/lib/events/schema";
import { createEvent } from "@/lib/events/service";
import type { StaffInput } from "@/lib/staff/schema";
import { createStaff } from "@/lib/staff/service";

const prefix = `vitest-sickness-ledger-${Date.now()}`;
const now = new Date("2026-09-14T12:00:00.000Z");
const nowAfterStart = new Date("2026-09-12T13:00:00.000Z");

type Fixture = {
  tenant: { id: string };
  user: { id: string };
  typeId: string;
  subtypeId: string;
  venueId: string;
  staffId: string;
  extraStaffId: string;
  eventId: string;
};

let tenantA: Fixture;
let tenantB: Fixture;
let namedId: string;
let laterFirstDayId: string;
let jamieId: string;
let archivedId: string;
let tenantBId: string;
let cancellationId: string;
let awolId: string;

function query(overrides: Partial<LedgerListQuery> = {}): LedgerListQuery {
  return { ...defaultLedgerListQuery("sickness"), ...overrides };
}

function staffFields(
  staffIdNumber: string,
  firstName: string,
  lastName: string,
): StaffInput {
  return {
    staffIdNumber,
    firstName,
    lastName,
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
      name: `Vitest Sickness Ledger ${label}`,
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
      name: `Sickness Ledger Venue ${label}`,
      nameNormalized: `sickness ledger venue ${label}`,
      timezone: "Europe/London",
      active: true,
    },
  });
  const staff = await createStaff(prisma, {
    tenantId: tenant.id,
    userId: user.id,
    input: staffFields(`SL-${label.toUpperCase()}`, "Alex", `Patel ${label}`),
  });
  if (!staff.ok) throw new Error("Failed to create fixture staff");
  const extra = await createStaff(prisma, {
    tenantId: tenant.id,
    userId: user.id,
    input: staffFields(`SLX-${label.toUpperCase()}`, "Jamie", `Cole ${label}`),
  });
  if (!extra.ok) throw new Error("Failed to create extra staff");
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
    extraStaffId: extra.id,
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
    idempotencyKey: `sickness-ledger-${Math.random().toString(36).slice(2)}`,
    ...overrides,
  };
}

async function addSickness(
  fixture: Fixture,
  overrides: Partial<SicknessInput> = {},
): Promise<string> {
  const result = await createSickness(prisma, {
    tenantId: fixture.tenant.id,
    userId: fixture.user.id,
    input: sicknessInput(fixture, overrides),
    now,
  });
  if (!result.ok) throw new Error(result.error);
  return result.id;
}

function awolInput(fixture: Fixture, overrides: Partial<AwolInput> = {}): AwolInput {
  return {
    type: "AWOL",
    staffId: fixture.staffId,
    eventId: fixture.eventId,
    reportedDate: "2026-09-12",
    notes: null,
    sameDayStartUnknownConfirmed: false,
    idempotencyKey: `awol-${Math.random().toString(36).slice(2, 12)}`,
    ...overrides,
  };
}

function rowHasIssueSummary(row: unknown): boolean {
  return JSON.stringify(row).includes("Secret migraine");
}

beforeAll(async () => {
  tenantA = await createFixture("a");
  tenantB = await createFixture("b");

  namedId = await addSickness(tenantA, {
    reportedDate: "2026-09-10",
    firstWorkingDaySick: "2026-09-10",
    issueSummary: "Secret migraine codeword",
  });
  laterFirstDayId = await addSickness(tenantA, {
    reportedDate: "2026-09-08",
    firstWorkingDaySick: "2026-09-12",
    sicknessStartedDate: "2026-09-07",
  });
  jamieId = await addSickness(tenantA, {
    staffId: tenantA.extraStaffId,
    reportedDate: "2026-09-11",
    firstWorkingDaySick: "2026-09-12",
    sicknessStartedDate: "2026-09-10",
  });
  archivedId = await addSickness(tenantA, {
    reportedDate: "2026-08-01",
    firstWorkingDaySick: "2026-08-01",
  });
  const archived = await prisma.absence.findFirstOrThrow({
    where: { id: archivedId, tenantId: tenantA.tenant.id },
    select: { updatedAt: true },
  });
  const archivedResult = await archiveSickness(prisma, {
    tenantId: tenantA.tenant.id,
    userId: tenantA.user.id,
    absenceId: archivedId,
    input: {
      archiveReason: "Entered against the wrong person",
      confirmArchive: true,
      expectedUpdatedAt: archived.updatedAt.toISOString(),
    },
  });
  if (!archivedResult.ok) throw new Error(archivedResult.error);

  tenantBId = await addSickness(tenantB, {
    reportedDate: "2026-09-10",
    firstWorkingDaySick: "2026-09-10",
    issueSummary: "Secret migraine codeword",
  });

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
  if (!cancellation.ok) throw new Error(cancellation.error);
  cancellationId = cancellation.id;

  const awol = await createAwol(prisma, {
    tenantId: tenantA.tenant.id,
    userId: tenantA.user.id,
    input: awolInput(tenantA, { staffId: tenantA.extraStaffId }),
    now: nowAfterStart,
  });
  if (!awol.ok) throw new Error(awol.error);
  awolId = awol.id;
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

describe("listSicknessForLedger", () => {
  it("returns active tenant Sickness rows and excludes other types and tenants", async () => {
    const list = await listSicknessForLedger(prisma, tenantA.tenant.id, query());
    const ids = list.rows.map((row) => row.id);
    expect(ids).toContain(namedId);
    expect(ids).toContain(laterFirstDayId);
    expect(ids).toContain(jamieId);
    expect(ids).not.toContain(archivedId);
    expect(ids).not.toContain(tenantBId);
    expect(ids).not.toContain(cancellationId);
    expect(ids).not.toContain(awolId);
    expect(list.rows.every((row) => row.type === "SICKNESS")).toBe(true);
    expect(list.activeTotal).toBe(3);
    expect(list.total).toBe(3);
  });

  it("includes archived rows only when Show archived is enabled", async () => {
    const hidden = await listSicknessForLedger(
      prisma,
      tenantA.tenant.id,
      query(),
    );
    expect(hidden.rows.some((row) => row.id === archivedId)).toBe(false);

    const shown = await listSicknessForLedger(
      prisma,
      tenantA.tenant.id,
      query({ includeArchived: true }),
    );
    const archived = shown.rows.find((row) => row.id === archivedId);
    expect(archived?.recordStatus).toBe("ARCHIVED");
    expect(shown.total).toBe(4);
    expect(shown.activeTotal).toBe(3);
  });

  it("does not return another tenant's rows or counts through search", async () => {
    const list = await listSicknessForLedger(
      prisma,
      tenantA.tenant.id,
      query({ q: "Patel b" }),
    );
    expect(list.rows.some((row) => row.id === tenantBId)).toBe(false);
    expect(list.total).toBe(0);
    expect(list.activeTotal).toBe(3);
  });

  it("searches Staff name, Staff ID, and snapshots without searching Issue summary", async () => {
    const byLast = await listSicknessForLedger(
      prisma,
      tenantA.tenant.id,
      query({ q: "Patel" }),
    );
    expect(byLast.rows.map((row) => row.id).sort()).toEqual(
      [namedId, laterFirstDayId].sort(),
    );

    const byId = await listSicknessForLedger(
      prisma,
      tenantA.tenant.id,
      query({ q: "SL-A" }),
    );
    expect(byId.rows.some((row) => row.id === namedId)).toBe(true);

    const byFull = await listSicknessForLedger(
      prisma,
      tenantA.tenant.id,
      query({ q: "Jamie Cole" }),
    );
    expect(byFull.rows.map((row) => row.id)).toEqual([jamieId]);

    const bySummary = await listSicknessForLedger(
      prisma,
      tenantA.tenant.id,
      query({ q: "migraine" }),
    );
    expect(bySummary.rows).toHaveLength(0);
  });

  it("keeps the snapshot after a live Staff rename and still matches the new name", async () => {
    await prisma.staff.update({
      where: { id: tenantA.staffId },
      data: { firstName: "Renamed" },
    });

    const bySnapshot = await listSicknessForLedger(
      prisma,
      tenantA.tenant.id,
      query({ q: "Alex" }),
    );
    const named = bySnapshot.rows.find((row) => row.id === namedId);
    expect(named?.sickness?.staffFirstNameSnapshot).toBe("Alex");
    expect(named?.sickness?.staffIdNumberSnapshot).toBe("SL-A");

    const byLive = await listSicknessForLedger(
      prisma,
      tenantA.tenant.id,
      query({ q: "Renamed" }),
    );
    expect(byLive.rows.some((row) => row.id === namedId)).toBe(true);

    await prisma.staff.update({
      where: { id: tenantA.staffId },
      data: { firstName: "Alex" },
    });
  });

  it("shows unavailable Staff from the snapshot without a live link marker", async () => {
    await prisma.staff.update({
      where: { id: tenantA.extraStaffId },
      data: { deletedAt: new Date() },
    });
    const list = await listSicknessForLedger(
      prisma,
      tenantA.tenant.id,
      query({ q: "Cole" }),
    );
    const jamie = list.rows.find((row) => row.id === jamieId);
    expect(jamie?.sickness?.staffLastNameSnapshot).toBe("Cole a");
    expect(jamie?.staff.deletedAt).not.toBeNull();
    await prisma.staff.update({
      where: { id: tenantA.extraStaffId },
      data: { deletedAt: null },
    });
  });

  it("never selects Issue summary text and flags presence separately", async () => {
    const list = await listSicknessForLedger(prisma, tenantA.tenant.id, query());
    const named = list.rows.find((row) => row.id === namedId);
    const jamie = list.rows.find((row) => row.id === jamieId);
    expect(named?.issueSummaryPresent).toBe(true);
    expect(jamie?.issueSummaryPresent).toBe(false);
    expect(list.rows.some(rowHasIssueSummary)).toBe(false);
    expect(
      list.rows.every(
        (row) => !Object.prototype.hasOwnProperty.call(row.sickness ?? {}, "issueSummary"),
      ),
    ).toBe(true);
  });

  it("applies inclusive reported and first-day ranges and ignores inverted ranges", async () => {
    const reported = await listSicknessForLedger(
      prisma,
      tenantA.tenant.id,
      query({ reportedFrom: "2026-09-10", reportedTo: "2026-09-10" }),
    );
    expect(reported.rows.map((row) => row.id)).toEqual([namedId]);

    const firstDay = await listSicknessForLedger(
      prisma,
      tenantA.tenant.id,
      query({ firstDayFrom: "2026-09-12", firstDayTo: "2026-09-12" }),
    );
    expect(firstDay.rows.map((row) => row.id).sort()).toEqual(
      [laterFirstDayId, jamieId].sort(),
    );

    const combined = await listSicknessForLedger(
      prisma,
      tenantA.tenant.id,
      query({
        q: "Patel",
        reportedFrom: "2026-09-08",
        reportedTo: "2026-09-10",
        firstDayFrom: "2026-09-10",
        firstDayTo: "2026-09-12",
      }),
    );
    expect(combined.rows.map((row) => row.id).sort()).toEqual(
      [namedId, laterFirstDayId].sort(),
    );

    const inverted = await listSicknessForLedger(
      prisma,
      tenantA.tenant.id,
      query({
        reportedFrom: "2026-09-20",
        reportedTo: "2026-09-01",
        firstDayFrom: "2026-09-20",
        firstDayTo: "2026-09-01",
      }),
    );
    expect(inverted.total).toBe(3);
  });

  it("orders by first working day, reported date, created timestamp and id by default", async () => {
    const list = await listSicknessForLedger(prisma, tenantA.tenant.id, query());
    expect(list.rows.map((row) => row.id)).toEqual([
      jamieId,
      laterFirstDayId,
      namedId,
    ]);
  });

  it("applies allow-listed sorts with stable tie-breakers", async () => {
    const reported = await listSicknessForLedger(
      prisma,
      tenantA.tenant.id,
      query({ sort: "reported", direction: "desc" }),
    );
    expect(reported.rows.map((row) => row.id)).toEqual([
      jamieId,
      namedId,
      laterFirstDayId,
    ]);

    const staffAsc = await listSicknessForLedger(
      prisma,
      tenantA.tenant.id,
      query({ sort: "staff", direction: "asc" }),
    );
    expect(
      staffAsc.rows.map((row) => row.sickness?.staffLastNameSnapshot),
    ).toEqual(["Cole a", "Patel a", "Patel a"]);

    const started = await listSicknessForLedger(
      prisma,
      tenantA.tenant.id,
      query({ sort: "sicknessStarted", direction: "desc" }),
    );
    expect(started.rows[0]?.id).toBe(jamieId);
    expect(started.rows[started.rows.length - 1]?.sickness?.sicknessStartedDate).toBeNull();

    const created = await listSicknessForLedger(
      prisma,
      tenantA.tenant.id,
      query({ sort: "created", direction: "asc" }),
    );
    expect(created.rows.map((row) => row.id)).toEqual([
      namedId,
      laterFirstDayId,
      jamieId,
    ]);
  });

  it("paginates after filters and clamps an invalid page", async () => {
    const pager = await createStaff(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: staffFields("SL-PAGER", "Morgan", "Pager"),
    });
    if (!pager.ok) throw new Error("Failed to create pager staff");
    for (let i = 0; i < 26; i += 1) {
      const day = String(i + 1).padStart(2, "0");
      await addSickness(tenantA, {
        staffId: pager.id,
        reportedDate: "2026-03-01",
        firstWorkingDaySick: `2026-03-${day}`,
      });
    }

    const page1 = await listSicknessForLedger(
      prisma,
      tenantA.tenant.id,
      query({ q: "Pager", page: 1 }),
    );
    expect(page1.rows).toHaveLength(25);
    expect(page1.total).toBe(26);
    expect(page1.pageCount).toBe(2);
    expect(page1.activeTotal).toBe(29);

    const page2 = await listSicknessForLedger(
      prisma,
      tenantA.tenant.id,
      query({ q: "Pager", page: 2 }),
    );
    expect(page2.rows).toHaveLength(1);

    const clamped = await listSicknessForLedger(
      prisma,
      tenantA.tenant.id,
      query({ q: "Pager", page: 99 }),
    );
    expect(clamped.page).toBe(2);
    expect(clamped.rows).toHaveLength(1);
  });

  it("does not write history or change updatedAt when listing", async () => {
    const before = await prisma.absence.findFirstOrThrow({
      where: { id: namedId, tenantId: tenantA.tenant.id },
      select: { updatedAt: true },
    });
    const historyBefore = await prisma.absenceHistory.count({
      where: { absenceId: namedId, tenantId: tenantA.tenant.id },
    });
    await listSicknessForLedger(prisma, tenantA.tenant.id, query());
    const after = await prisma.absence.findFirstOrThrow({
      where: { id: namedId, tenantId: tenantA.tenant.id },
      select: { updatedAt: true },
    });
    const historyAfter = await prisma.absenceHistory.count({
      where: { absenceId: namedId, tenantId: tenantA.tenant.id },
    });
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    expect(historyAfter).toBe(historyBefore);
  });
});
