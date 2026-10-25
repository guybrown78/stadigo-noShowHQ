import { Role } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listAbsencesForLedger } from "@/lib/absence/ledger-query";
import {
  changeAbsencePayPeriod,
  listPayPeriods,
  openPayPeriod,
  startNextPayPeriod,
  updateOpenPayPeriod,
} from "@/lib/absence/pay-periods";
import { defaultLedgerListQuery, type CancellationInput } from "@/lib/absence/schema";
import { createCancellation } from "@/lib/absence/service";
import { cancellationWatchlists } from "@/lib/absence/watchlists";
import { prisma } from "@/lib/db";
import { provisionTenantEventCatalog } from "@/lib/events/provision";
import type { EventInput } from "@/lib/events/schema";
import { createEvent } from "@/lib/events/service";
import type { StaffInput } from "@/lib/staff/schema";
import { createStaff } from "@/lib/staff/service";

const prefix = `vitest-pay-period-${Date.now()}`;

type Fixture = {
  tenant: { id: string };
  user: { id: string };
  staffId: string;
  eventId: string;
  venueId: string;
  typeId: string;
  subtypeId: string;
};

let tenantA: Fixture;
let tenantB: Fixture;

async function createFixture(label: string): Promise<Fixture> {
  const tenant = await prisma.tenant.create({
    data: {
      name: `Vitest Pay Period ${label}`,
      slug: `${prefix}-${label}`.toLowerCase(),
      cancellationThreshold: 1,
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
      name: `Pay Period Venue ${label}`,
      nameNormalized: `pay period venue ${label}`,
      identifier: "VEN-1",
      timezone: "Europe/London",
      active: true,
    },
  });
  const staff = await createStaff(prisma, {
    tenantId: tenant.id,
    userId: user.id,
    input: {
      staffIdNumber: `PP-${label.toUpperCase()}`,
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
    } satisfies StaffInput,
  });
  if (!staff.ok) {
    throw new Error("Failed to create fixture staff");
  }
  const event = await createNamedEvent(tenant.id, user.id, venue.id, sporting.id, sporting.subtypes[0]!.id, label, "2026-10-12");
  return {
    tenant,
    user,
    staffId: staff.id,
    eventId: event,
    venueId: venue.id,
    typeId: sporting.id,
    subtypeId: sporting.subtypes[0]!.id,
  };
}

async function createNamedEvent(
  tenantId: string,
  userId: string,
  venueId: string,
  typeId: string,
  subtypeId: string,
  label: string,
  eventDate: string,
) {
  const event = await createEvent(prisma, {
    tenantId,
    userId,
    input: {
      name: `Cup ${label} ${eventDate}`,
      reference: `PP-${label}-${eventDate}`.toUpperCase(),
      eventTypeId: typeId,
      eventSubtypeId: subtypeId,
      venueId,
      newVenueName: null,
      newVenueAddressLine1: null,
      newVenueTownCity: null,
      newVenuePostcode: null,
      eventDate,
      briefingTime: "12:00",
      startTime: "14:00",
      endTime: "17:00",
      endsNextDay: false,
      staffRequired: 10,
      warningFillRate: 90,
      criticalFillRate: 85,
      status: "PLANNED",
      notes: null,
    } satisfies EventInput,
  });
  if (!event.ok) {
    throw new Error("Failed to create fixture event");
  }
  return event.id;
}

function cancellationInput(
  fixture: Fixture,
  eventId: string,
  payPeriodId?: string,
): CancellationInput {
  return {
    type: "CANCELLATION",
    staffId: fixture.staffId,
    eventId,
    reportedDate: "2026-10-10",
    reportedTime: null,
    reason: "Family emergency",
    notes: null,
    retrospectiveConfirmed: false,
    payPeriodId,
  };
}

beforeAll(async () => {
  tenantA = await createFixture("a");
  tenantB = await createFixture("b");
});

afterAll(async () => {
  const tenantIds = [tenantA?.tenant.id, tenantB?.tenant.id].filter(Boolean);
  await prisma.absenceHistory.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.cancellationDetail.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.absence.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.payPeriod.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.event.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.venue.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.eventSubtype.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.eventType.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.staffProbationTask.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.staffProbationHistory.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.staffProbation.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.staff.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  await prisma.$disconnect();
});

describe("pay periods", () => {
  it("leaves a new absence unassigned when the organisation has no period", async () => {
    const created = await createCancellation(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: cancellationInput(tenantA, tenantA.eventId),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const row = await prisma.absence.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.payPeriodId).toBeNull();
  });

  it("opens period 1, rejects a second open period, and rejects an overlap", async () => {
    const opened = await openPayPeriod(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      startsOn: "2026-10-01",
      endsOn: "2026-10-31",
    });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const period = await prisma.payPeriod.findUniqueOrThrow({ where: { id: opened.id } });
    expect(period.number).toBe(1);
    expect(period.label).toBe("October 2026");
    expect(period.status).toBe("OPEN");

    const second = await openPayPeriod(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      startsOn: "2026-11-01",
      endsOn: "2026-11-30",
    });
    expect(second.ok).toBe(false);

    const otherTenant = await openPayPeriod(prisma, {
      tenantId: tenantB.tenant.id,
      userId: tenantB.user.id,
      startsOn: "2026-10-01",
      endsOn: "2026-10-31",
    });
    expect(otherTenant.ok).toBe(true);
    if (!otherTenant.ok) return;
    const other = await prisma.payPeriod.findUniqueOrThrow({
      where: { id: otherTenant.id },
    });
    expect(other.number).toBe(1);
  });

  it("files a new absence on the open period unless another period is chosen", async () => {
    const open = await prisma.payPeriod.findFirstOrThrow({
      where: { tenantId: tenantA.tenant.id, status: "OPEN" },
    });
    const otherEvent = await createNamedEvent(
      tenantA.tenant.id,
      tenantA.user.id,
      tenantA.venueId,
      tenantA.typeId,
      tenantA.subtypeId,
      "a-open",
      "2026-10-20",
    );
    const filed = await createCancellation(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: cancellationInput(tenantA, otherEvent),
    });
    expect(filed.ok).toBe(true);
    if (!filed.ok) return;
    const row = await prisma.absence.findUniqueOrThrow({ where: { id: filed.id } });
    expect(row.payPeriodId).toBe(open.id);

    const foreign = await prisma.payPeriod.findFirstOrThrow({
      where: { tenantId: tenantB.tenant.id },
    });
    const foreignEvent = await createNamedEvent(
      tenantA.tenant.id,
      tenantA.user.id,
      tenantA.venueId,
      tenantA.typeId,
      tenantA.subtypeId,
      "a-foreign",
      "2026-10-21",
    );
    const rejected = await createCancellation(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: cancellationInput(tenantA, foreignEvent, foreign.id),
    });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.error).toMatch(/organisation/);
    }
  });

  it("closes the current period when the next one starts and keeps its records", async () => {
    const tooSoon = await startNextPayPeriod(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      startsOn: "2026-10-31",
      endsOn: "2026-11-06",
    });
    expect(tooSoon.ok).toBe(false);

    const next = await startNextPayPeriod(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      startsOn: "2026-11-01",
      endsOn: "2026-11-30",
      todayIso: "2026-11-01",
    });
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    const opened = await prisma.payPeriod.findUniqueOrThrow({ where: { id: next.id } });
    expect(opened.number).toBe(2);
    expect(opened.label).toBe("November 2026");
    expect(opened.status).toBe("OPEN");
    const closed = await prisma.payPeriod.findFirstOrThrow({
      where: { tenantId: tenantA.tenant.id, number: 1 },
    });
    expect(closed.status).toBe("CLOSED");
    expect(closed.closedById).toBe(tenantA.user.id);

    const overlap = await updateOpenPayPeriod(prisma, {
      tenantId: tenantA.tenant.id,
      startsOn: "2026-10-20",
      endsOn: "2026-11-15",
    });
    expect(overlap.ok).toBe(false);

    const firstAbsence = await prisma.absence.findFirstOrThrow({
      where: { tenantId: tenantA.tenant.id, payPeriodId: closed.id },
    });
    const moved = await changeAbsencePayPeriod(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      absenceId: firstAbsence.id,
      payPeriodId: opened.id,
    });
    expect(moved.ok).toBe(true);
    const history = await prisma.absenceHistory.findFirstOrThrow({
      where: { absenceId: firstAbsence.id, action: "PERIOD_CHANGED" },
    });
    expect(history.action).toBe("PERIOD_CHANGED");

    const watch = await cancellationWatchlists(prisma, tenantA.tenant.id, {
      cancellationThreshold: 1,
    });
    expect(watch.openPeriod?.id).toBe(opened.id);
    expect(watch.previousPeriod?.id).toBe(closed.id);
    expect(watch.current.some((row) => row.staffId === tenantA.staffId)).toBe(true);

    const ledger = await listAbsencesForLedger(
      prisma,
      tenantA.tenant.id,
      { ...defaultLedgerListQuery("cancellations"), period: closed.id },
    );
    expect(ledger.rows.every((row) => row.id !== firstAbsence.id)).toBe(true);
    const openLedger = await listAbsencesForLedger(
      prisma,
      tenantA.tenant.id,
      { ...defaultLedgerListQuery("cancellations"), period: opened.id },
    );
    expect(openLedger.rows.some((row) => row.id === firstAbsence.id)).toBe(true);
  });

  it("keeps the period that includes today current when the next one starts later", async () => {
    const next = await startNextPayPeriod(prisma, {
      tenantId: tenantB.tenant.id,
      userId: tenantB.user.id,
      startsOn: "2026-11-01",
      endsOn: "2026-11-30",
      todayIso: "2026-10-25",
    });
    expect(next.ok).toBe(true);
    const current = await prisma.payPeriod.findFirstOrThrow({
      where: { tenantId: tenantB.tenant.id, number: 1 },
    });
    expect(current.status).toBe("OPEN");
    const scheduled = await prisma.payPeriod.findFirstOrThrow({
      where: { tenantId: tenantB.tenant.id, number: 2 },
    });
    expect(scheduled.status).toBe("SCHEDULED");

    const later = await startNextPayPeriod(prisma, {
      tenantId: tenantB.tenant.id,
      userId: tenantB.user.id,
      startsOn: "2026-12-01",
      endsOn: "2026-12-31",
      todayIso: "2026-10-25",
    });
    expect(later.ok).toBe(true);
    const third = await prisma.payPeriod.findFirstOrThrow({
      where: { tenantId: tenantB.tenant.id, number: 3 },
    });
    expect(third.status).toBe("SCHEDULED");
    expect(third.label).toBe("December 2026");

    await prisma.payPeriod.update({
      where: { id: current.id },
      data: { status: "CLOSED", closedAt: new Date(), closedById: tenantB.user.id },
    });
    await prisma.payPeriod.update({
      where: { id: scheduled.id },
      data: { status: "OPEN" },
    });
    const restored = await listPayPeriods(prisma, tenantB.tenant.id, "2026-10-25");
    expect(restored.find((period) => period.number === 1)?.status).toBe("OPEN");
    expect(restored.find((period) => period.number === 2)?.status).toBe("SCHEDULED");
    expect(restored.find((period) => period.number === 3)?.status).toBe("SCHEDULED");

    const listed = await listPayPeriods(prisma, tenantB.tenant.id, "2026-11-01");
    expect(listed.find((period) => period.number === 1)?.status).toBe("CLOSED");
    expect(listed.find((period) => period.number === 2)?.status).toBe("OPEN");
    expect(listed.find((period) => period.number === 3)?.status).toBe("SCHEDULED");
  });
});
