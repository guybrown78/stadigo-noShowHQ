import { Role } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { archiveCancellation, createCancellation } from "@/lib/absence/service";
import {
  getStaffOptionForAbsence,
  listActiveCancellationsForLedger,
} from "@/lib/absence/queries";
import {
  defaultLedgerListQuery,
  type CancellationInput,
  type LedgerListQuery,
} from "@/lib/absence/schema";
import { prisma } from "@/lib/db";
import { parseLocalDate } from "@/lib/events/dates";
import { provisionTenantEventCatalog } from "@/lib/events/provision";
import type { StaffInput } from "@/lib/staff/schema";
import { createStaff } from "@/lib/staff/service";

const prefix = `vitest-ledger-${Date.now()}`;

type Fixture = {
  tenant: { id: string };
  user: { id: string };
  typeId: string;
  subtypeId: string;
  festivalTypeId: string;
  festivalSubtypeId: string;
  venueId: string;
  venueTwoId: string;
  staffId: string;
  extraStaffId: string;
  eventId: string;
};

let tenantA: Fixture;
let tenantB: Fixture;
let alphaId: string;
let bravoId: string;
let shortNoticeId: string;
let retrospectiveId: string;
let missingVenueId: string;
let noReferenceId: string;
let archivedId: string;
let awolId: string;

function query(
  overrides: Partial<LedgerListQuery> = {},
): LedgerListQuery {
  return { ...defaultLedgerListQuery(), ...overrides };
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
      name: `Vitest Ledger ${label}`,
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
  const festival = await prisma.eventType.findFirstOrThrow({
    where: { tenantId: tenant.id, code: "festival" },
    include: { subtypes: { orderBy: { sortOrder: "asc" } } },
  });
  const venue = await prisma.venue.create({
    data: {
      tenantId: tenant.id,
      name: `Ledger Venue ${label}`,
      nameNormalized: `ledger venue ${label}`,
      timezone: "Europe/London",
      active: true,
    },
  });
  const venueTwo = await prisma.venue.create({
    data: {
      tenantId: tenant.id,
      name: `Other Venue ${label}`,
      nameNormalized: `other venue ${label}`,
      timezone: "Europe/London",
      active: false,
    },
  });
  const staff = await createStaff(prisma, {
    tenantId: tenant.id,
    userId: user.id,
    input: staffFields(`LG-${label.toUpperCase()}`, "Alex", `Patel ${label}`),
  });
  if (!staff.ok) throw new Error("Failed to create fixture staff");
  const extraStaff = await createStaff(prisma, {
    tenantId: tenant.id,
    userId: user.id,
    input: staffFields(`LGX-${label.toUpperCase()}`, "Jamie", `Cole ${label}`),
  });
  if (!extraStaff.ok) throw new Error("Failed to create extra staff");
  const event = await prisma.event.create({
    data: {
      tenantId: tenant.id,
      name: `Alpha Cup ${label}`,
      reference: `ALPHA-${label.toUpperCase()}`,
      eventTypeId: sporting.id,
      eventSubtypeId: sporting.subtypes[0]!.id,
      venueId: venue.id,
      eventDate: parseLocalDate("2026-09-12")!,
      startTime: "14:00",
      staffRequired: 10,
      createdById: user.id,
      updatedById: user.id,
    },
  });
  return {
    tenant,
    user,
    typeId: sporting.id,
    subtypeId: sporting.subtypes[0]!.id,
    festivalTypeId: festival.id,
    festivalSubtypeId: festival.subtypes[0]!.id,
    venueId: venue.id,
    venueTwoId: venueTwo.id,
    staffId: staff.id,
    extraStaffId: extraStaff.id,
    eventId: event.id,
  };
}

async function addEvent(
  fixture: Fixture,
  data: {
    name: string;
    reference?: string | null;
    venueId?: string;
    eventTypeId?: string;
    eventSubtypeId?: string;
    eventDate: string;
    startTime?: string | null;
  },
) {
  return prisma.event.create({
    data: {
      tenantId: fixture.tenant.id,
      name: data.name,
      reference: data.reference ?? null,
      eventTypeId: data.eventTypeId ?? fixture.typeId,
      eventSubtypeId: data.eventSubtypeId ?? fixture.subtypeId,
      venueId: data.venueId ?? fixture.venueId,
      eventDate: parseLocalDate(data.eventDate)!,
      startTime: data.startTime ?? "14:00",
      staffRequired: 10,
      createdById: fixture.user.id,
      updatedById: fixture.user.id,
    },
  });
}

async function addCancellation(
  fixture: Fixture,
  overrides: Partial<CancellationInput> & { eventId: string; staffId?: string },
) {
  const result = await createCancellation(prisma, {
    tenantId: fixture.tenant.id,
    userId: fixture.user.id,
    input: {
      type: "CANCELLATION",
      staffId: overrides.staffId ?? fixture.staffId,
      eventId: overrides.eventId,
      reportedDate: overrides.reportedDate ?? "2026-09-10",
      reportedTime: overrides.reportedTime ?? null,
      reason: overrides.reason ?? "Family emergency",
      notes: overrides.notes ?? null,
      retrospectiveConfirmed: overrides.retrospectiveConfirmed ?? false,
    },
  });
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.id;
}

beforeAll(async () => {
  tenantA = await createFixture("a");
  tenantB = await createFixture("b");

  alphaId = await addCancellation(tenantA, { eventId: tenantA.eventId });

  const bravoEvent = await addEvent(tenantA, {
    name: "Bravo Match a",
    reference: "BRAVO-A",
    venueId: tenantA.venueTwoId,
    eventTypeId: tenantA.festivalTypeId,
    eventSubtypeId: tenantA.festivalSubtypeId,
    eventDate: "2026-09-18",
  });
  bravoId = await addCancellation(tenantA, {
    eventId: bravoEvent.id,
    staffId: tenantA.extraStaffId,
    reportedDate: "2026-09-11",
    reportedTime: "09:00",
    reason: "Transport delay",
  });

  const shortEvent = await addEvent(tenantA, {
    name: "Short Notice Cup",
    reference: "SHORT-A",
    eventDate: "2026-09-20",
    startTime: "14:00",
  });
  shortNoticeId = await addCancellation(tenantA, {
    eventId: shortEvent.id,
    reportedDate: "2026-09-20",
    reportedTime: "13:00",
    reason: "Childcare",
  });

  const lateEvent = await addEvent(tenantA, {
    name: "Late Record Cup",
    reference: "LATE-A",
    eventDate: "2026-09-08",
    startTime: "14:00",
  });
  retrospectiveId = await addCancellation(tenantA, {
    eventId: lateEvent.id,
    reportedDate: "2026-09-09",
    reportedTime: "10:00",
    reason: "Reported after the event",
    retrospectiveConfirmed: true,
  });

  const missingVenueEvent = await addEvent(tenantA, {
    name: "No Venue Cup",
    reference: "NOVENUE-A",
    eventDate: "2026-09-22",
  });
  missingVenueId = await addCancellation(tenantA, {
    eventId: missingVenueEvent.id,
    reason: "Secret operational reason",
  });
  await prisma.cancellationDetail.update({
    where: { absenceId: missingVenueId },
    data: { venueIdSnapshot: null, venueNameSnapshot: null },
  });

  const noRefEvent = await addEvent(tenantA, {
    name: "No Reference Cup",
    reference: null,
    eventDate: "2026-09-25",
  });
  noReferenceId = await addCancellation(tenantA, {
    eventId: noRefEvent.id,
    staffId: tenantA.extraStaffId,
  });

  const archivedEvent = await addEvent(tenantA, {
    name: "Archived Cup",
    reference: "ARCH-A",
    eventDate: "2026-09-28",
  });
  archivedId = await addCancellation(tenantA, {
    eventId: archivedEvent.id,
    reason: "Will be archived",
  });
  const archived = await archiveCancellation(prisma, {
    tenantId: tenantA.tenant.id,
    userId: tenantA.user.id,
    absenceId: archivedId,
    input: {
      archiveReason: "Logged against the wrong event",
      confirmArchive: true,
    },
  });
  if (!archived.ok) throw new Error(archived.error);

  const awol = await prisma.absence.create({
    data: {
      tenantId: tenantA.tenant.id,
      staffId: tenantA.staffId,
      eventId: tenantA.eventId,
      type: "AWOL",
      reportedDate: parseLocalDate("2026-09-10")!,
      reason: "Did not attend",
      followUpType: "REVIEW",
      followUpStatus: "PENDING",
      recordStatus: "ACTIVE",
      createdById: tenantA.user.id,
      updatedById: tenantA.user.id,
    },
  });
  awolId = awol.id;
  await prisma.absence.create({
    data: {
      tenantId: tenantA.tenant.id,
      staffId: tenantA.staffId,
      type: "SICKNESS",
      reportedDate: parseLocalDate("2026-09-10")!,
      reason: "Flu",
      followUpType: "REVIEW",
      followUpStatus: "PENDING",
      recordStatus: "ACTIVE",
      createdById: tenantA.user.id,
      updatedById: tenantA.user.id,
    },
  });

  await addCancellation(tenantB, { eventId: tenantB.eventId });
});

afterAll(async () => {
  const tenantIds = [tenantA?.tenant.id, tenantB?.tenant.id].filter(Boolean);
  await prisma.absenceHistory.deleteMany({
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

describe("listActiveCancellationsForLedger", () => {
  it("returns only active same-tenant Cancellations", async () => {
    const list = await listActiveCancellationsForLedger(
      prisma,
      tenantA.tenant.id,
      query(),
    );
    const ids = list.rows.map((row) => row.id);
    expect(ids).toContain(alphaId);
    expect(ids).toContain(bravoId);
    expect(ids).not.toContain(archivedId);
    expect(ids).not.toContain(awolId);
    expect(list.rows.every((row) => row.type === "CANCELLATION")).toBe(true);
    expect(list.rows.every((row) => row.cancellation)).toBeTruthy();
    expect(list.activeTotal).toBe(list.total);
    expect(list.total).toBe(6);

    const other = await listActiveCancellationsForLedger(
      prisma,
      tenantB.tenant.id,
      query(),
    );
    expect(other.rows.every((row) => !ids.includes(row.id))).toBe(true);
    expect(other.total).toBe(1);
  });

  it("searches staff name, staff ID, event name and reference, not reason", async () => {
    const byName = await listActiveCancellationsForLedger(
      prisma,
      tenantA.tenant.id,
      query({ q: "jamie cole a" }),
    );
    expect(byName.rows.map((row) => row.id).sort()).toEqual(
      [bravoId, noReferenceId].sort(),
    );

    const mixed = await listActiveCancellationsForLedger(
      prisma,
      tenantA.tenant.id,
      query({ q: "  PaTeL a  " }),
    );
    expect(mixed.rows.some((row) => row.id === alphaId)).toBe(true);

    const byStaffId = await listActiveCancellationsForLedger(
      prisma,
      tenantA.tenant.id,
      query({ q: "lgx-a" }),
    );
    expect(byStaffId.rows.map((row) => row.id).sort()).toEqual(
      [bravoId, noReferenceId].sort(),
    );

    const byEvent = await listActiveCancellationsForLedger(
      prisma,
      tenantA.tenant.id,
      query({ q: "bravo match" }),
    );
    expect(byEvent.rows.map((row) => row.id)).toEqual([bravoId]);

    const byRef = await listActiveCancellationsForLedger(
      prisma,
      tenantA.tenant.id,
      query({ q: "ALPHA-A" }),
    );
    expect(byRef.rows.map((row) => row.id)).toEqual([alphaId]);

    const byReason = await listActiveCancellationsForLedger(
      prisma,
      tenantA.tenant.id,
      query({ q: "Secret operational reason" }),
    );
    expect(byReason.total).toBe(0);
  });

  it("filters by venue, event type and inclusive reported dates", async () => {
    const venue = await listActiveCancellationsForLedger(
      prisma,
      tenantA.tenant.id,
      query({ venue: tenantA.venueTwoId }),
    );
    expect(venue.rows.map((row) => row.id)).toEqual([bravoId]);

    const type = await listActiveCancellationsForLedger(
      prisma,
      tenantA.tenant.id,
      query({ eventType: tenantA.festivalTypeId }),
    );
    expect(type.rows.map((row) => row.id)).toEqual([bravoId]);

    const dates = await listActiveCancellationsForLedger(
      prisma,
      tenantA.tenant.id,
      query({ reportedFrom: "2026-09-10", reportedTo: "2026-09-11" }),
    );
    expect(dates.rows.map((row) => row.id).sort()).toEqual(
      [alphaId, bravoId, missingVenueId, noReferenceId].sort(),
    );

    const combined = await listActiveCancellationsForLedger(
      prisma,
      tenantA.tenant.id,
      query({
        q: "Jamie",
        venue: tenantA.venueTwoId,
        reportedFrom: "2026-09-11",
        reportedTo: "2026-09-11",
      }),
    );
    expect(combined.rows.map((row) => row.id)).toEqual([bravoId]);
    expect(combined.total).toBe(1);
    expect(combined.activeTotal).toBe(6);
  });

  it("ignores inverted reported dates and unknown or cross-tenant filters", async () => {
    const inverted = await listActiveCancellationsForLedger(
      prisma,
      tenantA.tenant.id,
      query({ reportedFrom: "2026-09-20", reportedTo: "2026-09-01" }),
    );
    expect(inverted.total).toBe(6);

    const unknownVenue = await listActiveCancellationsForLedger(
      prisma,
      tenantA.tenant.id,
      query({ venue: tenantB.venueId }),
    );
    expect(unknownVenue.total).toBe(0);

    const unknownType = await listActiveCancellationsForLedger(
      prisma,
      tenantA.tenant.id,
      query({ eventType: tenantB.typeId }),
    );
    expect(unknownType.total).toBe(0);
  });

  it("sorts deterministically for each allowed field", async () => {
    const reported = await listActiveCancellationsForLedger(
      prisma,
      tenantA.tenant.id,
      query({ sort: "reported", direction: "desc" }),
    );
    const reportedDates = reported.rows.map((row) =>
      row.reportedDate.toISOString().slice(0, 10),
    );
    expect(reportedDates).toEqual([...reportedDates].sort().reverse());
    const sameDay = reported.rows.filter(
      (row) => row.reportedDate.toISOString().slice(0, 10) === "2026-09-10",
    );
    expect(sameDay[0]?.reportedTime).toBeNull();
    expect(sameDay.some((row) => row.id === alphaId)).toBe(true);

    const staffAsc = await listActiveCancellationsForLedger(
      prisma,
      tenantA.tenant.id,
      query({ sort: "staff", direction: "asc" }),
    );
    const staffNames = staffAsc.rows.map(
      (row) => `${row.staff.lastName} ${row.staff.firstName}`,
    );
    expect(staffNames).toEqual([...staffNames].sort((a, b) => a.localeCompare(b)));

    const eventAsc = await listActiveCancellationsForLedger(
      prisma,
      tenantA.tenant.id,
      query({ sort: "event", direction: "asc" }),
    );
    const eventNames = eventAsc.rows.map(
      (row) => row.cancellation?.eventNameSnapshot ?? "",
    );
    expect(eventNames).toEqual([...eventNames].sort((a, b) => a.localeCompare(b)));

    const eventDate = await listActiveCancellationsForLedger(
      prisma,
      tenantA.tenant.id,
      query({ sort: "eventDate", direction: "asc" }),
    );
    const eventDates = eventDate.rows.map((row) =>
      row.cancellation?.eventDateSnapshot.toISOString().slice(0, 10),
    );
    expect(eventDates).toEqual([...eventDates].sort());

    const notice = await listActiveCancellationsForLedger(
      prisma,
      tenantA.tenant.id,
      query({ sort: "notice", direction: "asc" }),
    );
    const noticeDays = notice.rows.map(
      (row) => row.cancellation?.noticeCalendarDays ?? 0,
    );
    expect(noticeDays).toEqual([...noticeDays].sort((a, b) => a - b));
  });

  it("exposes stored notice flags and does not invent missing optional values", async () => {
    const list = await listActiveCancellationsForLedger(
      prisma,
      tenantA.tenant.id,
      query({ q: "Short Notice Cup" }),
    );
    expect(list.rows[0]?.id).toBe(shortNoticeId);
    expect(list.rows[0]?.cancellation?.noticeBasis).toBe("EXACT_TIME");
    expect(list.rows[0]?.cancellation?.isShortNotice).toBe(true);

    const late = await listActiveCancellationsForLedger(
      prisma,
      tenantA.tenant.id,
      query({ q: "Late Record Cup" }),
    );
    expect(late.rows[0]?.id).toBe(retrospectiveId);
    expect(late.rows[0]?.cancellation?.noticeCalendarDays).toBeLessThan(0);

    const missingVenue = await listActiveCancellationsForLedger(
      prisma,
      tenantA.tenant.id,
      query({ q: "No Venue Cup" }),
    );
    expect(missingVenue.rows[0]?.id).toBe(missingVenueId);
    expect(missingVenue.rows[0]?.cancellation?.venueNameSnapshot).toBeNull();

    const noRef = await listActiveCancellationsForLedger(
      prisma,
      tenantA.tenant.id,
      query({ q: "No Reference Cup" }),
    );
    expect(noRef.rows[0]?.id).toBe(noReferenceId);
    expect(noRef.rows[0]?.event?.reference ?? null).toBeNull();
  });

  it("paginates 25 records and clamps an invalid page", async () => {
    for (let i = 0; i < 26; i += 1) {
      const event = await addEvent(tenantA, {
        name: `PageEvent ${String(i).padStart(2, "0")}`,
        reference: `PG-${i}`,
        eventDate: "2026-11-01",
      });
      await addCancellation(tenantA, {
        eventId: event.id,
        reportedDate: "2026-10-15",
        reason: "Pagination fixture",
      });
    }

    const page1 = await listActiveCancellationsForLedger(
      prisma,
      tenantA.tenant.id,
      query({ q: "PageEvent", page: 1 }),
    );
    expect(page1.rows).toHaveLength(25);
    expect(page1.total).toBe(26);
    expect(page1.pageCount).toBe(2);
    expect(page1.activeTotal).toBe(32);

    const page2 = await listActiveCancellationsForLedger(
      prisma,
      tenantA.tenant.id,
      query({ q: "PageEvent", page: 2 }),
    );
    expect(page2.rows).toHaveLength(1);
    expect(page2.page).toBe(2);

    const clamped = await listActiveCancellationsForLedger(
      prisma,
      tenantA.tenant.id,
      query({ q: "PageEvent", page: 99 }),
    );
    expect(clamped.page).toBe(2);
    expect(clamped.rows).toHaveLength(1);
  });
});

describe("getStaffOptionForAbsence", () => {
  it("returns same-tenant staff and hides invalid, deleted or cross-tenant ids", async () => {
    const found = await getStaffOptionForAbsence(
      prisma,
      tenantA.tenant.id,
      tenantA.staffId,
    );
    expect(found?.id).toBe(tenantA.staffId);

    const missing = await getStaffOptionForAbsence(
      prisma,
      tenantA.tenant.id,
      "does-not-exist",
    );
    expect(missing).toBeNull();

    const cross = await getStaffOptionForAbsence(
      prisma,
      tenantA.tenant.id,
      tenantB.staffId,
    );
    expect(cross).toBeNull();

    const created = await createStaff(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: staffFields("LG-DEL", "Deleted", "Person"),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await prisma.staff.update({
      where: { id: created.id },
      data: { deletedAt: new Date(), deletedById: tenantA.user.id },
    });
    const deleted = await getStaffOptionForAbsence(
      prisma,
      tenantA.tenant.id,
      created.id,
    );
    expect(deleted).toBeNull();
  });
});
