import { Role } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  MISSED_SHIFT_ABSENCE_CONFLICT_MESSAGE,
  MISSED_SHIFT_BLOCKS_ABSENCE,
  MISSED_SHIFT_DUPLICATE_MESSAGE,
  MISSED_SHIFT_OTHER_SICKNESS_MESSAGE,
  MISSED_SHIFT_STAFF_CONFLICT_MESSAGE,
} from "@/lib/absence/missed-shift";
import {
  addMissedShift,
  removeMissedShift,
} from "@/lib/absence/missed-shift-service";
import { getAbsenceForTenant } from "@/lib/absence/queries";
import type { SicknessInput } from "@/lib/absence/schema";
import {
  archiveSickness,
  correctSickness,
  createAwol,
  createCancellation,
  createSickness,
} from "@/lib/absence/service";
import { prisma } from "@/lib/db";
import { provisionTenantEventCatalog } from "@/lib/events/provision";
import type { EventInput } from "@/lib/events/schema";
import { createEvent } from "@/lib/events/service";
import type { StaffInput } from "@/lib/staff/schema";
import { createStaff } from "@/lib/staff/service";

const prefix = `vitest-missed-shift-${Date.now()}`;
const now = new Date("2026-09-14T18:00:00.000Z");

type Fixture = {
  tenant: { id: string };
  user: { id: string };
  typeId: string;
  subtypeId: string;
  venueId: string;
  staffId: string;
  otherStaffId: string;
};

let fixture: Fixture;

function staffInput(label: string, staffIdNumber: string): StaffInput {
  return {
    staffIdNumber,
    firstName: "Jamie",
    lastName: label,
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

async function createFixture(): Promise<Fixture> {
  const tenant = await prisma.tenant.create({
    data: {
      name: "Vitest Missed Shifts",
      slug: prefix,
      timezone: "Europe/London",
    },
  });
  await provisionTenantEventCatalog(prisma, tenant);
  const user = await prisma.user.create({
    data: {
      email: `${prefix}@example.test`,
      firstName: "Test",
      lastName: "Admin",
      name: "Test Admin",
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
      name: "Missed Shift Venue",
      nameNormalized: "missed shift venue",
      identifier: "VEN-MS",
      timezone: "Europe/London",
      active: true,
    },
  });
  const staff = await createStaff(prisma, {
    tenantId: tenant.id,
    userId: user.id,
    input: staffInput("Cole", "MS-1"),
  });
  if (!staff.ok) throw new Error("Failed to create staff");
  const other = await createStaff(prisma, {
    tenantId: tenant.id,
    userId: user.id,
    input: staffInput("Other", "MS-2"),
  });
  if (!other.ok) throw new Error("Failed to create second staff");
  return {
    tenant,
    user,
    typeId: sporting.id,
    subtypeId: sporting.subtypes[0]!.id,
    venueId: venue.id,
    staffId: staff.id,
    otherStaffId: other.id,
  };
}

async function addEvent(name: string, reference: string, eventDate: string, startTime: string | null) {
  const input: EventInput = {
    name,
    reference,
    eventTypeId: fixture.typeId,
    eventSubtypeId: fixture.subtypeId,
    venueId: fixture.venueId,
    newVenueName: null,
    newVenueAddressLine1: null,
    newVenueTownCity: null,
    newVenuePostcode: null,
    eventDate,
    briefingTime: null,
    startTime,
    endTime: startTime ? "22:00" : null,
    endsNextDay: false,
    staffRequired: 10,
    warningFillRate: 90,
    criticalFillRate: 85,
    status: "PLANNED",
    notes: null,
  };
  const event = await createEvent(prisma, {
    tenantId: fixture.tenant.id,
    userId: fixture.user.id,
    input,
  });
  if (!event.ok) throw new Error(`Failed to create ${name}`);
  return event.id;
}

function sicknessInput(firstWorkingDaySick: string): SicknessInput {
  return {
    type: "SICKNESS",
    staffId: fixture.staffId,
    reportedDate: "2026-09-10",
    firstWorkingDaySick,
    sicknessStartedDate: null,
    issueSummary: null,
    futureFirstWorkingDayConfirmed: false,
    episodeState: "ONGOING",
    sicknessEndedDate: null,
    idempotencyKey: `sickness-${Math.random().toString(36).slice(2)}`,
  };
}

async function openSickness(firstWorkingDaySick: string) {
  const created = await createSickness(prisma, {
    tenantId: fixture.tenant.id,
    userId: fixture.user.id,
    input: sicknessInput(firstWorkingDaySick),
    now,
  });
  if (!created.ok) throw new Error(created.error);
  return created.id;
}

beforeAll(async () => {
  fixture = await createFixture();
});

afterAll(async () => {
  const tenantId = fixture?.tenant.id;
  if (!tenantId) return;
  await prisma.absenceIdempotencyKey.deleteMany({ where: { tenantId } });
  await prisma.sicknessMissedShift.deleteMany({ where: { tenantId } });
  await prisma.absenceFollowUp.deleteMany({ where: { tenantId } });
  await prisma.absenceHistory.deleteMany({ where: { tenantId } });
  await prisma.sicknessSelfCertification.deleteMany({ where: { tenantId } });
  await prisma.sicknessFitNote.deleteMany({ where: { tenantId } });
  await prisma.sicknessReturnToWork.deleteMany({ where: { tenantId } });
  await prisma.sicknessDetail.deleteMany({ where: { tenantId } });
  await prisma.awolDetail.deleteMany({ where: { tenantId } });
  await prisma.cancellationDetail.deleteMany({ where: { tenantId } });
  await prisma.absence.deleteMany({ where: { tenantId } });
  await prisma.event.deleteMany({ where: { tenantId } });
  await prisma.venue.deleteMany({ where: { tenantId } });
  await prisma.eventSubtype.deleteMany({ where: { tenantId } });
  await prisma.eventType.deleteMany({ where: { tenantId } });
  await prisma.staffProbationTask.deleteMany({ where: { tenantId } });
  await prisma.staffProbationHistory.deleteMany({ where: { tenantId } });
  await prisma.staffProbation.deleteMany({ where: { tenantId } });
  await prisma.staff.deleteMany({ where: { tenantId } });
  await prisma.user.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe("missed shifts on one sickness record", () => {
  it("keeps an existing sickness usable with no invented shifts", async () => {
    const absenceId = await openSickness("2026-08-01");
    const absence = await getAbsenceForTenant(prisma, fixture.tenant.id, absenceId);
    expect(absence.missedShifts).toEqual([]);
    expect(absence.eventId).toBeNull();
    expect(absence.sickness?.episodeState).toBe("ONGOING");
  });

  it("records non-consecutive shifts in date order and ignores the days between them", async () => {
    const friday = await addEvent("Friday night", "MS-FRI", "2026-09-11", "18:00");
    const saturday = await addEvent("Saturday match", "MS-SAT", "2026-09-12", "14:00");
    const monday = await addEvent("Monday cover", "MS-MON", "2026-09-14", "09:00");
    const absenceId = await openSickness("2026-09-11");
    const before = await getAbsenceForTenant(prisma, fixture.tenant.id, absenceId);

    for (const eventId of [monday, friday, saturday]) {
      const added = await addMissedShift(prisma, {
        tenantId: fixture.tenant.id,
        userId: fixture.user.id,
        input: {
          absenceId,
          eventId,
          idempotencyKey: `add-${eventId}`,
        },
        now,
      });
      expect(added.ok).toBe(true);
    }

    const absence = await getAbsenceForTenant(prisma, fixture.tenant.id, absenceId);
    expect(absence.missedShifts.map((shift) => shift.eventNameSnapshot)).toEqual([
      "Friday night",
      "Saturday match",
      "Monday cover",
    ]);
    expect(absence.missedShifts.map((shift) => shift.eventDateSnapshot.toISOString().slice(0, 10))).toEqual([
      "2026-09-11",
      "2026-09-12",
      "2026-09-14",
    ]);
    expect(absence.sickness?.episodeState).toBe("ONGOING");
    expect(absence.followUps).toEqual([]);
    expect(absence.payPeriodId).toBe(before.payPeriodId);
    expect(absence.history.some((row) => row.action === "MISSED_SHIFT_ADDED")).toBe(true);

    const replay = await addMissedShift(prisma, {
      tenantId: fixture.tenant.id,
      userId: fixture.user.id,
      input: {
        absenceId,
        eventId: friday,
        idempotencyKey: `add-${friday}`,
      },
      now,
    });
    expect(replay.ok).toBe(true);
    const afterReplay = await prisma.sicknessMissedShift.count({
      where: { absenceId, eventId: friday },
    });
    expect(afterReplay).toBe(1);
  });

  it("refuses the same shift twice and a shift already on another sickness", async () => {
    const eventId = await addEvent("Shared gate", "MS-GATE", "2026-09-08", "19:00");
    const first = await openSickness("2026-09-08");
    const second = await openSickness("2026-09-09");
    const added = await addMissedShift(prisma, {
      tenantId: fixture.tenant.id,
      userId: fixture.user.id,
      input: { absenceId: first, eventId, idempotencyKey: "add-gate-1" },
      now,
    });
    expect(added.ok).toBe(true);
    const duplicate = await addMissedShift(prisma, {
      tenantId: fixture.tenant.id,
      userId: fixture.user.id,
      input: { absenceId: first, eventId, idempotencyKey: "add-gate-2" },
      now,
    });
    expect(duplicate.ok).toBe(false);
    if (duplicate.ok) return;
    expect(duplicate.error).toBe(MISSED_SHIFT_DUPLICATE_MESSAGE);
    const other = await addMissedShift(prisma, {
      tenantId: fixture.tenant.id,
      userId: fixture.user.id,
      input: { absenceId: second, eventId, idempotencyKey: "add-gate-3" },
      now,
    });
    expect(other.ok).toBe(false);
    if (other.ok) return;
    expect(other.error).toBe(MISSED_SHIFT_OTHER_SICKNESS_MESSAGE);
    expect(other.existingAbsenceId).toBe(first);
  });

  it("refuses a shift that is already a cancellation or AWOL, and the reverse", async () => {
    const cancelledEvent = await addEvent("Cancelled gate", "MS-CAN", "2026-09-07", "18:00");
    const awolEvent = await addEvent("AWOL gate", "MS-AWOL", "2026-09-06", "18:00");
    const cancellation = await createCancellation(prisma, {
      tenantId: fixture.tenant.id,
      userId: fixture.user.id,
      input: {
        type: "CANCELLATION",
        staffId: fixture.staffId,
        eventId: cancelledEvent,
        reportedDate: "2026-09-06",
        reportedTime: null,
        reason: "Called ahead",
        notes: null,
        retrospectiveConfirmed: false,
      },
    });
    expect(cancellation.ok).toBe(true);
    if (!cancellation.ok) return;
    const awol = await createAwol(prisma, {
      tenantId: fixture.tenant.id,
      userId: fixture.user.id,
      input: {
        type: "AWOL",
        staffId: fixture.staffId,
        eventId: awolEvent,
        reportedDate: "2026-09-06",
        notes: null,
        sameDayStartUnknownConfirmed: false,
        idempotencyKey: "awol-gate-key",
      },
      now,
    });
    expect(awol.ok).toBe(true);
    if (!awol.ok) return;

    const absenceId = await openSickness("2026-09-07");
    const blockedCancellation = await addMissedShift(prisma, {
      tenantId: fixture.tenant.id,
      userId: fixture.user.id,
      input: {
        absenceId,
        eventId: cancelledEvent,
        idempotencyKey: "add-cancelled",
      },
      now,
    });
    expect(blockedCancellation.ok).toBe(false);
    if (blockedCancellation.ok) return;
    expect(blockedCancellation.error).toBe(MISSED_SHIFT_ABSENCE_CONFLICT_MESSAGE);
    expect(blockedCancellation.existingAbsenceId).toBe(cancellation.id);

    const blockedAwol = await addMissedShift(prisma, {
      tenantId: fixture.tenant.id,
      userId: fixture.user.id,
      input: { absenceId, eventId: awolEvent, idempotencyKey: "add-awol" },
      now,
    });
    expect(blockedAwol.ok).toBe(false);
    if (blockedAwol.ok) return;
    expect(blockedAwol.existingAbsenceId).toBe(awol.id);

    const freeEvent = await addEvent("Free gate", "MS-FREE", "2026-09-05", "18:00");
    const added = await addMissedShift(prisma, {
      tenantId: fixture.tenant.id,
      userId: fixture.user.id,
      input: { absenceId, eventId: freeEvent, idempotencyKey: "add-free" },
      now,
    });
    expect(added.ok).toBe(true);
    const reverse = await createCancellation(prisma, {
      tenantId: fixture.tenant.id,
      userId: fixture.user.id,
      input: {
        type: "CANCELLATION",
        staffId: fixture.staffId,
        eventId: freeEvent,
        reportedDate: "2026-09-05",
        reportedTime: null,
        reason: "Too late",
        notes: null,
        retrospectiveConfirmed: false,
      },
    });
    expect(reverse.ok).toBe(false);
    if (reverse.ok) return;
    expect(reverse.error).toBe(MISSED_SHIFT_BLOCKS_ABSENCE);
    expect(reverse.existingAbsenceId).toBe(absenceId);
    const reverseAwol = await createAwol(prisma, {
      tenantId: fixture.tenant.id,
      userId: fixture.user.id,
      input: {
        type: "AWOL",
        staffId: fixture.staffId,
        eventId: freeEvent,
        reportedDate: "2026-09-05",
        notes: null,
        sameDayStartUnknownConfirmed: false,
        idempotencyKey: "awol-free-blocked",
      },
      now,
    });
    expect(reverseAwol.ok).toBe(false);
    if (reverseAwol.ok) return;
    expect(reverseAwol.existingAbsenceId).toBe(absenceId);
  });

  it("removes a mistaken shift, updates the total, and allows that shift to be added again", async () => {
    const eventId = await addEvent("Wrong night", "MS-WRONG", "2026-09-04", "20:00");
    const absenceId = await openSickness("2026-09-04");
    const added = await addMissedShift(prisma, {
      tenantId: fixture.tenant.id,
      userId: fixture.user.id,
      input: { absenceId, eventId, idempotencyKey: "add-wrong" },
      now,
    });
    expect(added.ok).toBe(true);
    if (!added.ok || !added.shiftId) return;
    const removed = await removeMissedShift(prisma, {
      tenantId: fixture.tenant.id,
      userId: fixture.user.id,
      input: {
        absenceId,
        shiftId: added.shiftId,
        idempotencyKey: "remove-wrong",
      },
      now,
    });
    expect(removed.ok).toBe(true);
    const after = await getAbsenceForTenant(prisma, fixture.tenant.id, absenceId);
    expect(after.missedShifts).toEqual([]);
    expect(after.history.some((row) => row.action === "MISSED_SHIFT_REMOVED")).toBe(true);
    const again = await addMissedShift(prisma, {
      tenantId: fixture.tenant.id,
      userId: fixture.user.id,
      input: { absenceId, eventId, idempotencyKey: "add-wrong-again" },
      now,
    });
    expect(again.ok).toBe(true);
  });

  it("keeps archived shifts visible and frees the event for another sickness", async () => {
    const eventId = await addEvent("Archived night", "MS-ARCH", "2026-09-03", "18:00");
    const absenceId = await openSickness("2026-09-03");
    const added = await addMissedShift(prisma, {
      tenantId: fixture.tenant.id,
      userId: fixture.user.id,
      input: { absenceId, eventId, idempotencyKey: "add-arch" },
      now,
    });
    expect(added.ok).toBe(true);
    const existing = await getAbsenceForTenant(prisma, fixture.tenant.id, absenceId);
    const archived = await archiveSickness(prisma, {
      tenantId: fixture.tenant.id,
      userId: fixture.user.id,
      absenceId,
      input: {
        archiveReason: "Recorded for the wrong week",
        confirmArchive: true,
        expectedUpdatedAt: existing.updatedAt.toISOString(),
      },
    });
    expect(archived.ok).toBe(true);
    const stored = await prisma.sicknessMissedShift.findFirstOrThrow({
      where: { absenceId, eventId },
    });
    expect(stored.active).toBe(false);
    const visible = await getAbsenceForTenant(prisma, fixture.tenant.id, absenceId);
    expect(visible.missedShifts).toHaveLength(1);
    const replacement = await openSickness("2026-09-02");
    const moved = await addMissedShift(prisma, {
      tenantId: fixture.tenant.id,
      userId: fixture.user.id,
      input: { absenceId: replacement, eventId, idempotencyKey: "add-arch-next" },
      now,
    });
    expect(moved.ok).toBe(true);
  });

  it("moves shifts with a staff correction and refuses when the new staff already has that event", async () => {
    const eventId = await addEvent("Transfer night", "MS-MOVE", "2026-09-01", "18:00");
    const blockedEvent = await addEvent("Blocked night", "MS-BLOCK", "2026-08-31", "18:00");
    const absenceId = await openSickness("2026-09-01");
    await addMissedShift(prisma, {
      tenantId: fixture.tenant.id,
      userId: fixture.user.id,
      input: { absenceId, eventId, idempotencyKey: "add-move" },
      now,
    });
    const current = await getAbsenceForTenant(prisma, fixture.tenant.id, absenceId);
    const moved = await correctSickness(prisma, {
      tenantId: fixture.tenant.id,
      userId: fixture.user.id,
      absenceId,
      now,
      input: {
        type: "SICKNESS",
        staffId: fixture.otherStaffId,
        reportedDate: "2026-09-10",
        firstWorkingDaySick: "2026-09-01",
        sicknessStartedDate: null,
        issueSummary: null,
        futureFirstWorkingDayConfirmed: false,
        correctionReason: "Wrong staff member",
        expectedUpdatedAt: current.updatedAt.toISOString(),
      },
    });
    expect(moved.ok).toBe(true);
    const shift = await prisma.sicknessMissedShift.findFirstOrThrow({
      where: { absenceId, eventId },
    });
    expect(shift.staffId).toBe(fixture.otherStaffId);

    const blockedAbsence = await openSickness("2026-08-31");
    await addMissedShift(prisma, {
      tenantId: fixture.tenant.id,
      userId: fixture.user.id,
      input: {
        absenceId: blockedAbsence,
        eventId: blockedEvent,
        idempotencyKey: "add-block",
      },
      now,
    });
    await createCancellation(prisma, {
      tenantId: fixture.tenant.id,
      userId: fixture.user.id,
      input: {
        type: "CANCELLATION",
        staffId: fixture.otherStaffId,
        eventId: blockedEvent,
        reportedDate: "2026-08-30",
        reportedTime: null,
        reason: "Already off",
        notes: null,
        retrospectiveConfirmed: false,
      },
    });
    const blockedCurrent = await getAbsenceForTenant(
      prisma,
      fixture.tenant.id,
      blockedAbsence,
    );
    const refused = await correctSickness(prisma, {
      tenantId: fixture.tenant.id,
      userId: fixture.user.id,
      absenceId: blockedAbsence,
      now,
      input: {
        type: "SICKNESS",
        staffId: fixture.otherStaffId,
        reportedDate: "2026-09-10",
        firstWorkingDaySick: "2026-08-31",
        sicknessStartedDate: null,
        issueSummary: null,
        futureFirstWorkingDayConfirmed: false,
        correctionReason: "Wrong staff member",
        expectedUpdatedAt: blockedCurrent.updatedAt.toISOString(),
      },
    });
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error).toBe(MISSED_SHIFT_STAFF_CONFLICT_MESSAGE);
    const unchanged = await prisma.sicknessMissedShift.findFirstOrThrow({
      where: { absenceId: blockedAbsence, eventId: blockedEvent },
    });
    expect(unchanged.staffId).toBe(fixture.staffId);
  });

  it("allows two booked shifts on the same day when they are different events", async () => {
    const early = await addEvent("Friday early", "MS-EARLY", "2026-08-28", "10:00");
    const late = await addEvent("Friday late", "MS-LATE", "2026-08-28", "18:00");
    const absenceId = await openSickness("2026-08-28");
    for (const eventId of [late, early]) {
      const added = await addMissedShift(prisma, {
        tenantId: fixture.tenant.id,
        userId: fixture.user.id,
        input: { absenceId, eventId, idempotencyKey: `same-day-${eventId}` },
        now,
      });
      expect(added.ok).toBe(true);
    }
    const absence = await getAbsenceForTenant(prisma, fixture.tenant.id, absenceId);
    expect(absence.missedShifts.map((shift) => shift.eventStartTimeSnapshot)).toEqual([
      "10:00",
      "18:00",
    ]);
  });

  it("saves the shifts named while logging the sickness, without inventing the day between", async () => {
    const friday = await addEvent("Call Friday", "MS-CALL-FRI", "2026-08-21", "19:00");
    const sunday = await addEvent("Call Sunday", "MS-CALL-SUN", "2026-08-23", "19:00");
    const created = await createSickness(prisma, {
      tenantId: fixture.tenant.id,
      userId: fixture.user.id,
      now,
      input: {
        ...sicknessInput("2026-08-21"),
        missedShiftEventIds: [sunday, friday],
      },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const absence = await getAbsenceForTenant(prisma, fixture.tenant.id, created.id);
    expect(absence.eventId).toBeNull();
    expect(absence.missedShifts.map((shift) => shift.eventDateSnapshot.toISOString().slice(0, 10))).toEqual([
      "2026-08-21",
      "2026-08-23",
    ]);
    expect(absence.missedShifts.some((shift) => shift.eventDateSnapshot.toISOString().slice(0, 10) === "2026-08-22")).toBe(false);
  });

  it("does not save the sickness when a named shift is already a cancellation", async () => {
    const free = await addEvent("Call free", "MS-CALL-FREE", "2026-08-20", "19:00");
    const taken = await addEvent("Call taken", "MS-CALL-TAKEN", "2026-08-20", "12:00");
    const cancellation = await createCancellation(prisma, {
      tenantId: fixture.tenant.id,
      userId: fixture.user.id,
      input: {
        type: "CANCELLATION",
        staffId: fixture.staffId,
        eventId: taken,
        reportedDate: "2026-08-19",
        reportedTime: null,
        reason: "Already off",
        notes: null,
        retrospectiveConfirmed: false,
      },
    });
    expect(cancellation.ok).toBe(true);
    if (!cancellation.ok) return;
    const before = await prisma.absence.count({
      where: { tenantId: fixture.tenant.id, type: "SICKNESS" },
    });
    const created = await createSickness(prisma, {
      tenantId: fixture.tenant.id,
      userId: fixture.user.id,
      now,
      input: {
        ...sicknessInput("2026-08-20"),
        missedShiftEventIds: [free, taken],
      },
    });
    expect(created.ok).toBe(false);
    if (created.ok) return;
    expect(created.error).toContain("Call taken");
    expect(created.error).toContain(MISSED_SHIFT_ABSENCE_CONFLICT_MESSAGE);
    expect(created.existingAbsenceId).toBe(cancellation.id);
    const after = await prisma.absence.count({
      where: { tenantId: fixture.tenant.id, type: "SICKNESS" },
    });
    expect(after).toBe(before);
    expect(await prisma.sicknessMissedShift.count({ where: { eventId: free } })).toBe(0);
  });
});
