import { Role } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  archiveCancellation,
  correctCancellation,
  createCancellation,
} from "@/lib/absence/service";
import { AbsenceAccessError } from "@/lib/absence/errors";
import {
  getAbsenceForTenant,
  listActiveAbsencesForStaff,
  searchEventsForAbsence,
  searchStaffForAbsence,
} from "@/lib/absence/queries";
import type { CancellationInput } from "@/lib/absence/schema";
import { prisma } from "@/lib/db";
import { provisionTenantEventCatalog } from "@/lib/events/provision";
import type { EventInput } from "@/lib/events/schema";
import { createEvent, updateEvent } from "@/lib/events/service";
import type { StaffInput } from "@/lib/staff/schema";
import { createStaff } from "@/lib/staff/service";

const prefix = `vitest-absence-${Date.now()}`;

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
      name: `Vitest Absence ${label}`,
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
  const venue = await prisma.venue.create({
    data: {
      tenantId: tenant.id,
      name: `Absence Venue ${label}`,
      nameNormalized: `absence venue ${label}`,
      timezone: "Europe/London",
      active: true,
    },
  });
  const staffInput: StaffInput = {
    staffIdNumber: `ST-${label.toUpperCase()}`,
    firstName: "Alex",
    lastName: `Patel ${label}`,
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
  if (!staff.ok) {
    throw new Error("Failed to create fixture staff");
  }
  const eventInput: EventInput = {
    name: `Cup Final ${label}`,
    reference: `CF-${label.toUpperCase()}`,
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
  if (!event.ok) {
    throw new Error("Failed to create fixture event");
  }
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

function inputFor(
  fixture: Fixture,
  overrides: Partial<CancellationInput> = {},
): CancellationInput {
  return {
    type: "CANCELLATION",
    staffId: fixture.staffId,
    eventId: fixture.eventId,
    reportedDate: "2026-09-10",
    reportedTime: null,
    reason: "Family emergency",
    notes: null,
    retrospectiveConfirmed: false,
    ...overrides,
  };
}

beforeAll(async () => {
  tenantA = await createFixture("a");
  tenantB = await createFixture("b");
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

describe("absence cancellation service", () => {
  it("creates a valid cancellation with pending follow-up", async () => {
    const result = await createCancellation(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: inputFor(tenantA, { notes: "Called the office" }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const absence = await getAbsenceForTenant(
      prisma,
      tenantA.tenant.id,
      result.id,
    );
    expect(absence.type).toBe("CANCELLATION");
    expect(absence.followUpType).toBe("REVIEW");
    expect(absence.followUpStatus).toBe("PENDING");
    expect(absence.recordStatus).toBe("ACTIVE");
    expect(absence.notes).toBe("Called the office");
    expect(absence.cancellation?.noticeBasis).toBe("CALENDAR_DATE");
    expect(absence.cancellation?.noticeCalendarDays).toBe(2);
    expect(absence.cancellation?.noticeMinutes).toBeNull();
    expect(absence.cancellation?.eventNameSnapshot).toBe("Cup Final a");
    expect(absence.cancellation?.venueNameSnapshot).toBe("Absence Venue a");
    expect(absence.history[0]?.action).toBe("CREATED");
  });

  it("stores exact-time notice and a short-notice flag", async () => {
    const event = await createEvent(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: {
        name: "Short notice event",
        reference: "SN-1",
        eventTypeId: tenantA.typeId,
        eventSubtypeId: tenantA.subtypeId,
        venueId: tenantA.venueId,
        newVenueName: null,
        newVenueAddressLine1: null,
        newVenueTownCity: null,
        newVenuePostcode: null,
        eventDate: "2026-09-20",
        briefingTime: null,
        startTime: "14:00",
        endTime: "17:00",
        endsNextDay: false,
        staffRequired: 10,
        warningFillRate: 90,
        criticalFillRate: 85,
        status: "PLANNED",
        notes: null,
      },
    });
    expect(event.ok).toBe(true);
    if (!event.ok) return;

    const result = await createCancellation(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: inputFor(tenantA, {
        eventId: event.id,
        reportedDate: "2026-09-19",
        reportedTime: "16:00",
        reason: "Travel delay",
      }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const absence = await getAbsenceForTenant(
      prisma,
      tenantA.tenant.id,
      result.id,
    );
    expect(absence.cancellation?.noticeBasis).toBe("EXACT_TIME");
    expect(absence.cancellation?.noticeMinutes).toBe(22 * 60);
    expect(absence.cancellation?.isShortNotice).toBe(true);
  });

  it("rejects a retrospective record without confirmation and keeps negative notice when confirmed", async () => {
    const event = await createEvent(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: {
        name: "Late entry event",
        reference: "LE-1",
        eventTypeId: tenantA.typeId,
        eventSubtypeId: tenantA.subtypeId,
        venueId: tenantA.venueId,
        newVenueName: null,
        newVenueAddressLine1: null,
        newVenueTownCity: null,
        newVenuePostcode: null,
        eventDate: "2026-08-01",
        briefingTime: null,
        startTime: "14:00",
        endTime: null,
        endsNextDay: false,
        staffRequired: 8,
        warningFillRate: 90,
        criticalFillRate: 85,
        status: "COMPLETED",
        notes: null,
      },
    });
    expect(event.ok).toBe(true);
    if (!event.ok) return;

    const rejected = await createCancellation(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: inputFor(tenantA, {
        eventId: event.id,
        reportedDate: "2026-08-03",
      }),
    });
    expect(rejected.ok).toBe(false);
    if (rejected.ok) return;
    expect(rejected.fieldErrors?.retrospectiveConfirmed).toBeTruthy();

    const created = await createCancellation(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: inputFor(tenantA, {
        eventId: event.id,
        reportedDate: "2026-08-03",
        retrospectiveConfirmed: true,
      }),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const absence = await getAbsenceForTenant(
      prisma,
      tenantA.tenant.id,
      created.id,
    );
    expect(absence.cancellation?.noticeCalendarDays).toBe(-2);
  });

  it("blocks a second active cancellation for the same staff and event", async () => {
    const first = await getAbsenceForTenant(
      prisma,
      tenantA.tenant.id,
      (
        await prisma.absence.findFirstOrThrow({
          where: {
            tenantId: tenantA.tenant.id,
            staffId: tenantA.staffId,
            eventId: tenantA.eventId,
          },
        })
      ).id,
    );
    const second = await createCancellation(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: inputFor(tenantA),
    });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.existingAbsenceId).toBe(first.id);
    const count = await prisma.absence.count({
      where: {
        tenantId: tenantA.tenant.id,
        staffId: tenantA.staffId,
        eventId: tenantA.eventId,
        recordStatus: "ACTIVE",
      },
    });
    expect(count).toBe(1);
  });

  it("preserves event snapshots after the live event is renamed", async () => {
    const event = await createEvent(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: {
        name: "Original name",
        reference: "REN-1",
        eventTypeId: tenantA.typeId,
        eventSubtypeId: tenantA.subtypeId,
        venueId: tenantA.venueId,
        newVenueName: null,
        newVenueAddressLine1: null,
        newVenueTownCity: null,
        newVenuePostcode: null,
        eventDate: "2026-10-01",
        briefingTime: null,
        startTime: "18:00",
        endTime: null,
        endsNextDay: false,
        staffRequired: 12,
        warningFillRate: 90,
        criticalFillRate: 85,
        status: "PLANNED",
        notes: null,
      },
    });
    expect(event.ok).toBe(true);
    if (!event.ok) return;
    const created = await createCancellation(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: inputFor(tenantA, { eventId: event.id }),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const renamed = await updateEvent(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      eventId: event.id,
      input: {
        name: "Renamed later",
        reference: "REN-1",
        eventTypeId: tenantA.typeId,
        eventSubtypeId: tenantA.subtypeId,
        venueId: tenantA.venueId,
        newVenueName: null,
        newVenueAddressLine1: null,
        newVenueTownCity: null,
        newVenuePostcode: null,
        eventDate: "2026-10-01",
        briefingTime: null,
        startTime: "18:00",
        endTime: null,
        endsNextDay: false,
        staffRequired: 12,
        warningFillRate: 90,
        criticalFillRate: 85,
        status: "PLANNED",
        notes: null,
      },
    });
    expect(renamed.ok).toBe(true);

    const absence = await getAbsenceForTenant(
      prisma,
      tenantA.tenant.id,
      created.id,
    );
    expect(absence.cancellation?.eventNameSnapshot).toBe("Original name");
    expect(absence.event?.name).toBe("Renamed later");
  });

  it("records correction audit without resetting follow-up", async () => {
    const event = await createEvent(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: {
        name: "Correction event",
        reference: "COR-1",
        eventTypeId: tenantA.typeId,
        eventSubtypeId: tenantA.subtypeId,
        venueId: tenantA.venueId,
        newVenueName: null,
        newVenueAddressLine1: null,
        newVenueTownCity: null,
        newVenuePostcode: null,
        eventDate: "2026-11-01",
        briefingTime: null,
        startTime: "12:00",
        endTime: null,
        endsNextDay: false,
        staffRequired: 6,
        warningFillRate: 90,
        criticalFillRate: 85,
        status: "PLANNED",
        notes: null,
      },
    });
    expect(event.ok).toBe(true);
    if (!event.ok) return;
    const created = await createCancellation(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: inputFor(tenantA, { eventId: event.id, reason: "Original reason" }),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const corrected = await correctCancellation(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      absenceId: created.id,
      input: {
        ...inputFor(tenantA, {
          eventId: event.id,
          reason: "Updated reason",
          reportedDate: "2026-10-30",
        }),
        correctionReason: "Typed the wrong reason",
      },
    });
    expect(corrected.ok).toBe(true);
    if (!corrected.ok) return;

    const absence = await getAbsenceForTenant(
      prisma,
      tenantA.tenant.id,
      created.id,
    );
    expect(absence.reason).toBe("Updated reason");
    expect(absence.followUpStatus).toBe("PENDING");
    const correction = absence.history.find((entry) => entry.action === "CORRECTED");
    expect(correction?.reason).toBe("Typed the wrong reason");
    const changes = (correction?.changes ?? []) as {
      field: string;
      previous: string | null;
      next: string | null;
    }[];
    const reasonChange = changes.find((change) => change.field === "reason");
    expect(reasonChange).toMatchObject({
      previous: "Original reason",
      next: "Updated reason",
    });
  });

  it("archives a cancellation out of staff history while keeping the record", async () => {
    const event = await createEvent(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: {
        name: "Archive event",
        reference: "AR-1",
        eventTypeId: tenantA.typeId,
        eventSubtypeId: tenantA.subtypeId,
        venueId: tenantA.venueId,
        newVenueName: null,
        newVenueAddressLine1: null,
        newVenueTownCity: null,
        newVenuePostcode: null,
        eventDate: "2026-12-01",
        briefingTime: null,
        startTime: null,
        endTime: null,
        endsNextDay: false,
        staffRequired: 4,
        warningFillRate: 90,
        criticalFillRate: 85,
        status: "PLANNED",
        notes: null,
      },
    });
    expect(event.ok).toBe(true);
    if (!event.ok) return;
    const created = await createCancellation(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: inputFor(tenantA, { eventId: event.id }),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const archived = await archiveCancellation(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      absenceId: created.id,
      input: {
        archiveReason: "Logged against the wrong event",
        confirmArchive: true,
      },
    });
    expect(archived.ok).toBe(true);

    const history = await listActiveAbsencesForStaff(
      prisma,
      tenantA.tenant.id,
      tenantA.staffId,
    );
    expect(history.absences.some((row) => row.id === created.id)).toBe(false);

    const record = await getAbsenceForTenant(
      prisma,
      tenantA.tenant.id,
      created.id,
    );
    expect(record.recordStatus).toBe("ARCHIVED");
    expect(record.archiveReason).toBe("Logged against the wrong event");
  });

  it("hides cross-tenant staff, events and absences", async () => {
    await expect(
      getAbsenceForTenant(
        prisma,
        tenantB.tenant.id,
        (
          await prisma.absence.findFirstOrThrow({
            where: { tenantId: tenantA.tenant.id },
          })
        ).id,
      ),
    ).rejects.toBeInstanceOf(AbsenceAccessError);

    const foreignStaff = await createCancellation(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: inputFor(tenantA, { staffId: tenantB.staffId }),
    });
    expect(foreignStaff.ok).toBe(false);

    const foreignEvent = await createCancellation(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: inputFor(tenantA, { eventId: tenantB.eventId }),
    });
    expect(foreignEvent.ok).toBe(false);

    const staffHits = await searchStaffForAbsence(
      prisma,
      tenantA.tenant.id,
      "Patel b",
    );
    expect(staffHits.some((row) => row.id === tenantB.staffId)).toBe(false);

    const eventHits = await searchEventsForAbsence(
      prisma,
      tenantA.tenant.id,
      "Cup Final b",
    );
    expect(eventHits.some((row) => row.id === tenantB.eventId)).toBe(false);
  });

  it("does not change staff employment or event status", async () => {
    const event = await createEvent(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: {
        name: "Status check event",
        reference: "ST-CHK",
        eventTypeId: tenantA.typeId,
        eventSubtypeId: tenantA.subtypeId,
        venueId: tenantA.venueId,
        newVenueName: null,
        newVenueAddressLine1: null,
        newVenueTownCity: null,
        newVenuePostcode: null,
        eventDate: "2027-01-15",
        briefingTime: null,
        startTime: "19:00",
        endTime: null,
        endsNextDay: false,
        staffRequired: 20,
        warningFillRate: 90,
        criticalFillRate: 85,
        status: "CONFIRMED",
        notes: null,
      },
    });
    expect(event.ok).toBe(true);
    if (!event.ok) return;

    await createCancellation(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: inputFor(tenantA, { eventId: event.id }),
    });

    const staff = await prisma.staff.findUniqueOrThrow({
      where: { id: tenantA.staffId },
    });
    const liveEvent = await prisma.event.findUniqueOrThrow({
      where: { id: event.id },
    });
    expect(staff.employmentStatus).toBe("ACTIVE");
    expect(liveEvent.status).toBe("CONFIRMED");
    expect(liveEvent.staffRequired).toBe(20);
  });

  it("includes inactive staff in absence search", async () => {
    const staff = await createStaff(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: {
        staffIdNumber: "ST-INACTIVE",
        firstName: "Morgan",
        lastName: "Inactive",
        email: null,
        phone: null,
        department: null,
        roleTitle: "Steward",
        managerStaffId: null,
        employmentStatus: "INACTIVE",
        startDate: null,
        applyProbation: false,
        probationLengthDays: null,
        overrideProbationEndDate: false,
        probationEndDate: null,
        probationStatus: "NOT_APPLICABLE",
        securityClearanceStatus: "NOT_RECORDED",
        securityClearanceExpiryDate: null,
        notes: null,
      },
    });
    expect(staff.ok).toBe(true);
    if (!staff.ok) return;
    const hits = await searchStaffForAbsence(prisma, tenantA.tenant.id, "Inactive");
    expect(hits.some((row) => row.id === staff.id)).toBe(true);
  });
});
