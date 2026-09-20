import { Role } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  archiveAwol,
  archiveCancellation,
  archiveSickness,
  createAwol,
  createCancellation,
  createSickness,
} from "@/lib/absence/service";
import { listAbsencesForLedger } from "@/lib/absence/queries";
import {
  defaultLedgerListQuery,
  type AwolInput,
  type LedgerListQuery,
  type SicknessInput,
} from "@/lib/absence/schema";
import { prisma } from "@/lib/db";
import { parseLocalDate } from "@/lib/events/dates";
import { provisionTenantEventCatalog } from "@/lib/events/provision";
import type { StaffInput } from "@/lib/staff/schema";
import { createStaff } from "@/lib/staff/service";

const prefix = `vitest-unified-ledger-${Date.now()}`;
const nowAfterStart = new Date("2026-09-12T13:00:00.000Z");
const sicknessNow = new Date("2026-09-14T12:00:00.000Z");

type Fixture = {
  tenant: { id: string };
  user: { id: string };
  typeId: string;
  subtypeId: string;
  venueId: string;
  staffId: string;
  extraStaffId: string;
};

let tenantA: Fixture;
let tenantB: Fixture;
let cancellationId: string;
let awolId: string;
let sicknessId: string;
let archivedCancellationId: string;
let archivedAwolId: string;
let archivedSicknessId: string;
let otherTenantId: string;

function query(overrides: Partial<LedgerListQuery> = {}): LedgerListQuery {
  return { ...defaultLedgerListQuery("all"), ...overrides };
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
      name: `Vitest Unified Ledger ${label}`,
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
      name: `Unified Venue ${label}`,
      nameNormalized: `unified venue ${label}`,
      timezone: "Europe/London",
      active: true,
    },
  });
  const staff = await createStaff(prisma, {
    tenantId: tenant.id,
    userId: user.id,
    input: staffFields(`UL-${label.toUpperCase()}`, "Alex", `Patel ${label}`),
  });
  if (!staff.ok) throw new Error("Failed to create fixture staff");
  const extra = await createStaff(prisma, {
    tenantId: tenant.id,
    userId: user.id,
    input: staffFields(`ULX-${label.toUpperCase()}`, "Jamie", `Cole ${label}`),
  });
  if (!extra.ok) throw new Error("Failed to create extra staff");
  return {
    tenant,
    user,
    typeId: sporting.id,
    subtypeId: sporting.subtypes[0]!.id,
    venueId: venue.id,
    staffId: staff.id,
    extraStaffId: extra.id,
  };
}

async function addEvent(
  fixture: Fixture,
  data: { name: string; reference: string; eventDate: string },
) {
  return prisma.event.create({
    data: {
      tenantId: fixture.tenant.id,
      name: data.name,
      reference: data.reference,
      eventTypeId: fixture.typeId,
      eventSubtypeId: fixture.subtypeId,
      venueId: fixture.venueId,
      eventDate: parseLocalDate(data.eventDate)!,
      startTime: "14:00",
      staffRequired: 10,
      createdById: fixture.user.id,
      updatedById: fixture.user.id,
    },
  });
}

function awolInput(fixture: Fixture, eventId: string, overrides: Partial<AwolInput> = {}): AwolInput {
  return {
    type: "AWOL",
    staffId: fixture.staffId,
    eventId,
    reportedDate: "2026-09-11",
    notes: "Secret AWOL notes",
    sameDayStartUnknownConfirmed: false,
    idempotencyKey: `unified-awol-${Math.random().toString(36).slice(2, 12)}`,
    ...overrides,
  };
}

function sicknessInput(
  fixture: Fixture,
  overrides: Partial<SicknessInput> = {},
): SicknessInput {
  return {
    type: "SICKNESS",
    staffId: fixture.staffId,
    reportedDate: "2026-09-10",
    firstWorkingDaySick: "2026-09-13",
    sicknessStartedDate: "2026-09-09",
    issueSummary: "Secret migraine codeword",
    futureFirstWorkingDayConfirmed: false,
    idempotencyKey: `unified-sickness-${Math.random().toString(36).slice(2, 12)}`,
    ...overrides,
  };
}

function rowHasSensitiveText(row: unknown): boolean {
  const json = JSON.stringify(row);
  return (
    json.includes("Secret migraine") ||
    json.includes("Secret AWOL notes") ||
    json.includes("Secret cancellation reason")
  );
}

beforeAll(async () => {
  tenantA = await createFixture("a");
  tenantB = await createFixture("b");

  const cancelEvent = await addEvent(tenantA, {
    name: "Unified Cup",
    reference: "UNI-C",
    eventDate: "2026-09-14",
  });
  const cancellation = await createCancellation(prisma, {
    tenantId: tenantA.tenant.id,
    userId: tenantA.user.id,
    input: {
      type: "CANCELLATION",
      staffId: tenantA.staffId,
      eventId: cancelEvent.id,
      reportedDate: "2026-09-12",
      reportedTime: null,
      reason: "Secret cancellation reason",
      notes: null,
      retrospectiveConfirmed: false,
    },
  });
  if (!cancellation.ok) throw new Error(cancellation.error);
  cancellationId = cancellation.id;

  const awolEvent = await addEvent(tenantA, {
    name: "Unified Cup",
    reference: "UNI-A",
    eventDate: "2026-09-10",
  });
  const awol = await createAwol(prisma, {
    tenantId: tenantA.tenant.id,
    userId: tenantA.user.id,
    input: awolInput(tenantA, awolEvent.id, { staffId: tenantA.extraStaffId }),
    now: nowAfterStart,
  });
  if (!awol.ok) throw new Error(awol.error);
  awolId = awol.id;

  const sickness = await createSickness(prisma, {
    tenantId: tenantA.tenant.id,
    userId: tenantA.user.id,
    input: sicknessInput(tenantA),
    now: sicknessNow,
  });
  if (!sickness.ok) throw new Error(sickness.error);
  sicknessId = sickness.id;

  const archivedCancelEvent = await addEvent(tenantA, {
    name: "Archived Cup",
    reference: "UNI-AC",
    eventDate: "2026-08-02",
  });
  const archivedCancel = await createCancellation(prisma, {
    tenantId: tenantA.tenant.id,
    userId: tenantA.user.id,
    input: {
      type: "CANCELLATION",
      staffId: tenantA.extraStaffId,
      eventId: archivedCancelEvent.id,
      reportedDate: "2026-08-01",
      reportedTime: null,
      reason: "Wrong event",
      notes: null,
      retrospectiveConfirmed: false,
    },
  });
  if (!archivedCancel.ok) throw new Error(archivedCancel.error);
  archivedCancellationId = archivedCancel.id;
  const archivedCancelResult = await archiveCancellation(prisma, {
    tenantId: tenantA.tenant.id,
    userId: tenantA.user.id,
    absenceId: archivedCancellationId,
    input: {
      archiveReason: "Entered against the wrong person",
      confirmArchive: true,
    },
  });
  if (!archivedCancelResult.ok) throw new Error(archivedCancelResult.error);

  const archivedAwolEvent = await addEvent(tenantA, {
    name: "Archived AWOL Cup",
    reference: "UNI-AA",
    eventDate: "2026-08-03",
  });
  const archivedAwol = await createAwol(prisma, {
    tenantId: tenantA.tenant.id,
    userId: tenantA.user.id,
    input: awolInput(tenantA, archivedAwolEvent.id, {
      reportedDate: "2026-08-04",
      notes: null,
    }),
    now: nowAfterStart,
  });
  if (!archivedAwol.ok) throw new Error(archivedAwol.error);
  archivedAwolId = archivedAwol.id;
  const archivedAwolRow = await prisma.absence.findFirstOrThrow({
    where: { id: archivedAwolId },
    select: { updatedAt: true },
  });
  const archivedAwolResult = await archiveAwol(prisma, {
    tenantId: tenantA.tenant.id,
    userId: tenantA.user.id,
    absenceId: archivedAwolId,
    input: {
      archiveReason: "Entered against the wrong person",
      confirmArchive: true,
      expectedUpdatedAt: archivedAwolRow.updatedAt.toISOString(),
    },
  });
  if (!archivedAwolResult.ok) throw new Error(archivedAwolResult.error);

  const archivedSickness = await createSickness(prisma, {
    tenantId: tenantA.tenant.id,
    userId: tenantA.user.id,
    input: sicknessInput(tenantA, {
      staffId: tenantA.extraStaffId,
      reportedDate: "2026-08-01",
      firstWorkingDaySick: "2026-08-01",
      sicknessStartedDate: null,
      issueSummary: null,
    }),
    now: sicknessNow,
  });
  if (!archivedSickness.ok) throw new Error(archivedSickness.error);
  archivedSicknessId = archivedSickness.id;
  const archivedSicknessRow = await prisma.absence.findFirstOrThrow({
    where: { id: archivedSicknessId },
    select: { updatedAt: true },
  });
  const archivedSicknessResult = await archiveSickness(prisma, {
    tenantId: tenantA.tenant.id,
    userId: tenantA.user.id,
    absenceId: archivedSicknessId,
    input: {
      archiveReason: "Entered against the wrong person",
      confirmArchive: true,
      expectedUpdatedAt: archivedSicknessRow.updatedAt.toISOString(),
    },
  });
  if (!archivedSicknessResult.ok) throw new Error(archivedSicknessResult.error);

  const otherEvent = await addEvent(tenantB, {
    name: "Other Cup",
    reference: "OTH-1",
    eventDate: "2026-09-14",
  });
  const other = await createCancellation(prisma, {
    tenantId: tenantB.tenant.id,
    userId: tenantB.user.id,
    input: {
      type: "CANCELLATION",
      staffId: tenantB.staffId,
      eventId: otherEvent.id,
      reportedDate: "2026-09-12",
      reportedTime: null,
      reason: "Other tenant",
      notes: null,
      retrospectiveConfirmed: false,
    },
  });
  if (!other.ok) throw new Error(other.error);
  otherTenantId = other.id;
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

describe("listAbsencesForLedger", () => {
  it("returns active Cancellation, AWOL and Sickness rows for the tenant", async () => {
    const list = await listAbsencesForLedger(prisma, tenantA.tenant.id, query());
    const ids = list.rows.map((row) => row.id);
    expect(ids).toEqual([cancellationId, awolId, sicknessId]);
    expect(ids).not.toContain(archivedCancellationId);
    expect(ids).not.toContain(archivedAwolId);
    expect(ids).not.toContain(archivedSicknessId);
    expect(ids).not.toContain(otherTenantId);
    expect(new Set(list.rows.map((row) => row.type))).toEqual(
      new Set(["CANCELLATION", "AWOL", "SICKNESS"]),
    );
    expect(list.total).toBe(3);
    expect(list.activeTotal).toBe(3);
    expect(list.activeTypeCounts).toEqual({
      CANCELLATION: 1,
      AWOL: 1,
      SICKNESS: 1,
    });
  });

  it("filters by type view and keeps counts scoped to that view", async () => {
    const cancellations = await listAbsencesForLedger(
      prisma,
      tenantA.tenant.id,
      query({ view: "cancellations" }),
    );
    expect(cancellations.rows.map((row) => row.id)).toEqual([cancellationId]);
    expect(cancellations.rows.every((row) => row.type === "CANCELLATION")).toBe(
      true,
    );
    expect(cancellations.activeTotal).toBe(1);

    const awols = await listAbsencesForLedger(
      prisma,
      tenantA.tenant.id,
      query({ view: "awol" }),
    );
    expect(awols.rows.map((row) => row.id)).toEqual([awolId]);
    expect(awols.activeTotal).toBe(1);

    const sickness = await listAbsencesForLedger(
      prisma,
      tenantA.tenant.id,
      query({ view: "sickness" }),
    );
    expect(sickness.rows.map((row) => row.id)).toEqual([sicknessId]);
    expect(sickness.activeTotal).toBe(1);
  });

  it("includes authorised archived rows across types when Show archived is on", async () => {
    const list = await listAbsencesForLedger(
      prisma,
      tenantA.tenant.id,
      query({ includeArchived: true }),
    );
    const ids = list.rows.map((row) => row.id);
    expect(ids).toContain(archivedCancellationId);
    expect(ids).toContain(archivedAwolId);
    expect(ids).toContain(archivedSicknessId);
    expect(list.total).toBe(6);
    expect(list.activeTotal).toBe(3);
    expect(
      list.rows.find((row) => row.id === archivedSicknessId)?.recordStatus,
    ).toBe("ARCHIVED");
  });

  it("derives recorded and affected dates for each type", async () => {
    const list = await listAbsencesForLedger(prisma, tenantA.tenant.id, query());
    const cancellation = list.rows.find((row) => row.id === cancellationId);
    const awol = list.rows.find((row) => row.id === awolId);
    const sickness = list.rows.find((row) => row.id === sicknessId);
    expect(cancellation?.recordedDate.toISOString().slice(0, 10)).toBe(
      "2026-09-12",
    );
    expect(cancellation?.affectedDate?.toISOString().slice(0, 10)).toBe(
      "2026-09-14",
    );
    expect(awol?.recordedDate.toISOString().slice(0, 10)).toBe("2026-09-11");
    expect(awol?.affectedDate?.toISOString().slice(0, 10)).toBe("2026-09-10");
    expect(sickness?.recordedDate.toISOString().slice(0, 10)).toBe("2026-09-10");
    expect(sickness?.affectedDate?.toISOString().slice(0, 10)).toBe(
      "2026-09-13",
    );
  });

  it("searches Staff and Event fields and never sensitive text", async () => {
    const byStaff = await listAbsencesForLedger(
      prisma,
      tenantA.tenant.id,
      query({ q: "Patel" }),
    );
    expect(byStaff.rows.map((row) => row.id).sort()).toEqual(
      [cancellationId, sicknessId].sort(),
    );

    const byStaffId = await listAbsencesForLedger(
      prisma,
      tenantA.tenant.id,
      query({ q: "ULX-A" }),
    );
    expect(byStaffId.rows.map((row) => row.id)).toEqual([awolId]);

    const byEvent = await listAbsencesForLedger(
      prisma,
      tenantA.tenant.id,
      query({ q: "Unified Cup" }),
    );
    expect(byEvent.rows.map((row) => row.id).sort()).toEqual(
      [cancellationId, awolId].sort(),
    );

    const byReason = await listAbsencesForLedger(
      prisma,
      tenantA.tenant.id,
      query({ q: "Secret cancellation reason" }),
    );
    expect(byReason.total).toBe(0);

    const byNotes = await listAbsencesForLedger(
      prisma,
      tenantA.tenant.id,
      query({ q: "Secret AWOL notes" }),
    );
    expect(byNotes.total).toBe(0);

    const bySummary = await listAbsencesForLedger(
      prisma,
      tenantA.tenant.id,
      query({ q: "migraine" }),
    );
    expect(bySummary.total).toBe(0);
  });

  it("applies inclusive recorded and affected ranges and ignores inverted ranges", async () => {
    const recorded = await listAbsencesForLedger(
      prisma,
      tenantA.tenant.id,
      query({ reportedFrom: "2026-09-12", reportedTo: "2026-09-12" }),
    );
    expect(recorded.rows.map((row) => row.id)).toEqual([cancellationId]);

    const affected = await listAbsencesForLedger(
      prisma,
      tenantA.tenant.id,
      query({ affectedFrom: "2026-09-13", affectedTo: "2026-09-14" }),
    );
    expect(affected.rows.map((row) => row.id).sort()).toEqual(
      [cancellationId, sicknessId].sort(),
    );

    const inverted = await listAbsencesForLedger(
      prisma,
      tenantA.tenant.id,
      query({
        reportedFrom: "2026-09-20",
        reportedTo: "2026-09-01",
        affectedFrom: "2026-09-20",
        affectedTo: "2026-09-01",
      }),
    );
    expect(inverted.total).toBe(3);
  });

  it("excludes Sickness when an Event filter is applied without treating it as invalid", async () => {
    const venue = await listAbsencesForLedger(
      prisma,
      tenantA.tenant.id,
      query({ venue: tenantA.venueId }),
    );
    expect(venue.rows.map((row) => row.id).sort()).toEqual(
      [cancellationId, awolId].sort(),
    );
    expect(venue.rows.some((row) => row.type === "SICKNESS")).toBe(false);
    expect(venue.activeTotal).toBe(3);

    const eventType = await listAbsencesForLedger(
      prisma,
      tenantA.tenant.id,
      query({ eventType: tenantA.typeId }),
    );
    expect(eventType.rows.every((row) => row.type !== "SICKNESS")).toBe(true);
    expect(eventType.total).toBe(2);
  });

  it("orders mixed types deterministically and allow-lists sort fields", async () => {
    const affected = await listAbsencesForLedger(
      prisma,
      tenantA.tenant.id,
      query({ sort: "affected", direction: "desc" }),
    );
    expect(affected.rows.map((row) => row.id)).toEqual([
      cancellationId,
      sicknessId,
      awolId,
    ]);

    const typeAsc = await listAbsencesForLedger(
      prisma,
      tenantA.tenant.id,
      query({ sort: "type", direction: "asc" }),
    );
    expect(typeAsc.rows.map((row) => row.type)).toEqual([
      "CANCELLATION",
      "AWOL",
      "SICKNESS",
    ]);

    const invalid = await listAbsencesForLedger(
      prisma,
      tenantA.tenant.id,
      query({ sort: "notice" }),
    );
    expect(invalid.rows.map((row) => row.id)).toEqual([
      cancellationId,
      awolId,
      sicknessId,
    ]);
  });

  it("omits raw Issue summary, AWOL notes and Cancellation reasons from the projection", async () => {
    const list = await listAbsencesForLedger(prisma, tenantA.tenant.id, query());
    const sickness = list.rows.find((row) => row.id === sicknessId);
    expect(sickness?.issueSummaryPresent).toBe(true);
    expect(
      list.rows.every(
        (row) =>
          !Object.prototype.hasOwnProperty.call(row.sickness ?? {}, "issueSummary"),
      ),
    ).toBe(true);
    expect(list.rows.some(rowHasSensitiveText)).toBe(false);
    expect(
      list.rows.every((row) => !("reason" in row) || row.reason === undefined),
    ).toBe(true);
    expect(
      list.rows.every((row) => !("notes" in row) || row.notes === undefined),
    ).toBe(true);
  });

  it("does not leak another tenant's rows or counts", async () => {
    const list = await listAbsencesForLedger(
      prisma,
      tenantA.tenant.id,
      query({ q: "Patel b" }),
    );
    expect(list.rows.some((row) => row.id === otherTenantId)).toBe(false);
    expect(list.total).toBe(0);
    expect(list.activeTotal).toBe(3);
  });

  it("paginates after filters and clamps an invalid page", async () => {
    const page1 = await listAbsencesForLedger(
      prisma,
      tenantA.tenant.id,
      query({ page: 1 }),
    );
    expect(page1.rows).toHaveLength(3);
    expect(page1.pageCount).toBe(1);

    const clamped = await listAbsencesForLedger(
      prisma,
      tenantA.tenant.id,
      query({ page: 99 }),
    );
    expect(clamped.page).toBe(1);
    expect(clamped.rows).toHaveLength(3);
  });
});
