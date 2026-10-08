import { Role } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getAbsenceDashboard, listDashboardEventOptions } from "@/lib/absence/dashboard-query";
import { resolveDashboardQuery } from "@/lib/absence/dashboard-range";
import {
  archiveCancellation,
  createAwol,
  createCancellation,
  createSickness,
} from "@/lib/absence/service";
import type { AwolInput, SicknessInput } from "@/lib/absence/schema";
import { prisma } from "@/lib/db";
import { parseLocalDate } from "@/lib/events/dates";
import { provisionTenantEventCatalog } from "@/lib/events/provision";
import type { StaffInput } from "@/lib/staff/schema";
import { createStaff } from "@/lib/staff/service";

const prefix = `vitest-dashboard-${Date.now()}`;
const now = new Date("2026-10-08T15:00:00.000Z");

type Fixture = {
  tenant: { id: string };
  user: { id: string };
  typeId: string;
  subtypeId: string;
  northId: string;
  southId: string;
  alexId: string;
  jamieId: string;
  samId: string;
  drewId: string;
};

let tenantA: Fixture;
let tenantB: Fixture;
let northCupId: string;
let northNightId: string;
let southCupId: string;

const resolvedPeriod = resolveDashboardQuery(
  { range: "custom", from: "2026-09-01", to: "2026-09-30" },
  "2026-10-08",
);
if (!resolvedPeriod.ok) {
  throw new Error(resolvedPeriod.error);
}
const period = resolvedPeriod;

function staffFields(
  staffIdNumber: string,
  firstName: string,
  lastName: string,
  roleTitle: string,
  contact?: { email?: string; phone?: string; notes?: string },
): StaffInput {
  return {
    staffIdNumber,
    firstName,
    lastName,
    email: contact?.email ?? null,
    phone: contact?.phone ?? null,
    department: null,
    roleTitle,
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
    notes: contact?.notes ?? null,
  };
}

async function createFixture(label: string): Promise<Fixture> {
  const tenant = await prisma.tenant.create({
    data: {
      name: `Vitest Dashboard ${label}`,
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
  const north = await prisma.venue.create({
    data: {
      tenantId: tenant.id,
      name: "North Stand",
      nameNormalized: "north stand",
      timezone: "Europe/London",
      active: true,
    },
  });
  const south = await prisma.venue.create({
    data: {
      tenantId: tenant.id,
      name: "South Stand",
      nameNormalized: "south stand",
      timezone: "Europe/London",
      active: true,
    },
  });
  const alex = await mustStaff(tenant.id, user.id, staffFields(
    `DA-${label.toUpperCase()}`,
    "Alex",
    "Patel",
    "Steward",
    {
      email: "secret-dashboard@example.test",
      phone: "07000999111",
      notes: "Secret staff notes",
    },
  ));
  const jamie = await mustStaff(
    tenant.id,
    user.id,
    staffFields(`DJ-${label.toUpperCase()}`, "Jamie", "Cole", "Host"),
  );
  const sam = await mustStaff(
    tenant.id,
    user.id,
    staffFields(`DS-${label.toUpperCase()}`, "Sam", "Reed", "Supervisor"),
  );
  const drew = await mustStaff(
    tenant.id,
    user.id,
    staffFields(`DD-${label.toUpperCase()}`, "Drew", "Shah", "Steward"),
  );
  return {
    tenant,
    user,
    typeId: sporting.id,
    subtypeId: sporting.subtypes[0]!.id,
    northId: north.id,
    southId: south.id,
    alexId: alex,
    jamieId: jamie,
    samId: sam,
    drewId: drew,
  };
}

async function mustStaff(
  tenantId: string,
  userId: string,
  input: StaffInput,
): Promise<string> {
  const created = await createStaff(prisma, { tenantId, userId, input });
  if (!created.ok) throw new Error(created.error);
  return created.id;
}

async function addEvent(
  fixture: Fixture,
  data: { name: string; reference: string; eventDate: string; venueId: string },
) {
  return prisma.event.create({
    data: {
      tenantId: fixture.tenant.id,
      name: data.name,
      reference: data.reference,
      eventTypeId: fixture.typeId,
      eventSubtypeId: fixture.subtypeId,
      venueId: data.venueId,
      eventDate: parseLocalDate(data.eventDate)!,
      startTime: "14:00",
      staffRequired: 10,
      createdById: fixture.user.id,
      updatedById: fixture.user.id,
    },
  });
}

async function cancel(
  fixture: Fixture,
  input: {
    staffId: string;
    eventId: string;
    reportedDate: string;
    reason: string;
    retrospectiveConfirmed?: boolean;
  },
) {
  const created = await createCancellation(prisma, {
    tenantId: fixture.tenant.id,
    userId: fixture.user.id,
    input: {
      type: "CANCELLATION",
      staffId: input.staffId,
      eventId: input.eventId,
      reportedDate: input.reportedDate,
      reportedTime: null,
      reason: input.reason,
      notes: null,
      retrospectiveConfirmed: input.retrospectiveConfirmed ?? false,
    },
  });
  if (!created.ok) throw new Error(created.error);
  return created.id;
}

function awolInput(fixture: Fixture, eventId: string, staffId: string): AwolInput {
  return {
    type: "AWOL",
    staffId,
    eventId,
    reportedDate: "2026-09-12",
    notes: "Secret AWOL notes",
    sameDayStartUnknownConfirmed: false,
    idempotencyKey: `dash-awol-${Math.random().toString(36).slice(2, 12)}`,
  };
}

function sicknessInput(
  fixture: Fixture,
  staffId: string,
  firstWorkingDaySick: string,
  issueSummary: string | null,
): SicknessInput {
  return {
    type: "SICKNESS",
    staffId,
    reportedDate: firstWorkingDaySick,
    firstWorkingDaySick,
    sicknessStartedDate: null,
    issueSummary,
    futureFirstWorkingDayConfirmed: false,
    episodeState: "NOT_CONFIRMED",
    sicknessEndedDate: null,
    idempotencyKey: `dash-sick-${Math.random().toString(36).slice(2, 12)}`,
  };
}

async function sick(
  fixture: Fixture,
  staffId: string,
  firstWorkingDaySick: string,
  issueSummary: string | null,
) {
  const created = await createSickness(prisma, {
    tenantId: fixture.tenant.id,
    userId: fixture.user.id,
    input: sicknessInput(fixture, staffId, firstWorkingDaySick, issueSummary),
    now,
  });
  if (!created.ok) throw new Error(created.error);
  return created.id;
}

function load(overrides: { venueId?: string | null; eventId?: string | null } = {}) {
  return getAbsenceDashboard(prisma, tenantA.tenant.id, {
    from: period.range.from,
    to: period.range.to,
    previousFrom: period.range.previousFrom,
    previousTo: period.range.previousTo,
    buckets: period.buckets,
    venueId: overrides.venueId ?? null,
    eventId: overrides.eventId ?? null,
  });
}

beforeAll(async () => {
  tenantA = await createFixture("a");
  tenantB = await createFixture("b");

  const northCup = await addEvent(tenantA, {
    name: "North Cup",
    reference: "D-NC",
    eventDate: "2026-09-10",
    venueId: tenantA.northId,
  });
  northCupId = northCup.id;
  await cancel(tenantA, {
    staffId: tenantA.alexId,
    eventId: northCup.id,
    reportedDate: "2026-07-01",
    reason: "Secret cancellation reason",
  });

  const northNight = await addEvent(tenantA, {
    name: "North Night",
    reference: "D-NN",
    eventDate: "2026-09-12",
    venueId: tenantA.northId,
  });
  northNightId = northNight.id;
  const awol = await createAwol(prisma, {
    tenantId: tenantA.tenant.id,
    userId: tenantA.user.id,
    input: awolInput(tenantA, northNight.id, tenantA.alexId),
    now,
  });
  if (!awol.ok) throw new Error(awol.error);

  const alexSicknessId = await sick(
    tenantA,
    tenantA.alexId,
    "2026-09-14",
    "Secret migraine codeword",
  );
  await prisma.sicknessDetail.update({
    where: { absenceId: alexSicknessId },
    data: {
      sicknessEndedDate: parseLocalDate("2026-09-18"),
      episodeState: "ENDED",
    },
  });

  const southCup = await addEvent(tenantA, {
    name: "South Cup",
    reference: "D-SC",
    eventDate: "2026-09-11",
    venueId: tenantA.southId,
  });
  southCupId = southCup.id;
  await cancel(tenantA, {
    staffId: tenantA.jamieId,
    eventId: southCup.id,
    reportedDate: "2026-09-11",
    reason: "Transport failed",
  });

  await sick(tenantA, tenantA.samId, "2026-09-01", null);
  await sick(tenantA, tenantA.samId, "2026-09-20", null);

  const archivedEvent = await addEvent(tenantA, {
    name: "Archived Cup",
    reference: "D-AC",
    eventDate: "2026-09-15",
    venueId: tenantA.northId,
  });
  const archivedId = await cancel(tenantA, {
    staffId: tenantA.alexId,
    eventId: archivedEvent.id,
    reportedDate: "2026-09-15",
    reason: "Wrong event",
  });
  const archived = await archiveCancellation(prisma, {
    tenantId: tenantA.tenant.id,
    userId: tenantA.user.id,
    absenceId: archivedId,
    input: {
      archiveReason: "Entered against the wrong person",
      confirmArchive: true,
    },
  });
  if (!archived.ok) throw new Error(archived.error);

  const prevStart = await addEvent(tenantA, {
    name: "Prev Start",
    reference: "D-PS",
    eventDate: "2026-08-02",
    venueId: tenantA.northId,
  });
  await cancel(tenantA, {
    staffId: tenantA.alexId,
    eventId: prevStart.id,
    reportedDate: "2026-08-02",
    reason: "Previous start",
  });

  const prevEnd = await addEvent(tenantA, {
    name: "Prev End",
    reference: "D-PE",
    eventDate: "2026-08-31",
    venueId: tenantA.southId,
  });
  await cancel(tenantA, {
    staffId: tenantA.jamieId,
    eventId: prevEnd.id,
    reportedDate: "2026-08-31",
    reason: "Previous end",
  });

  const beforeWindow = await addEvent(tenantA, {
    name: "Before Window",
    reference: "D-BW",
    eventDate: "2026-08-01",
    venueId: tenantA.northId,
  });
  await cancel(tenantA, {
    staffId: tenantA.samId,
    eventId: beforeWindow.id,
    reportedDate: "2026-08-01",
    reason: "Day before previous period",
  });

  const reportedInside = await addEvent(tenantA, {
    name: "Reported Inside",
    reference: "D-RI",
    eventDate: "2026-07-15",
    venueId: tenantA.northId,
  });
  await cancel(tenantA, {
    staffId: tenantA.drewId,
    eventId: reportedInside.id,
    reportedDate: "2026-09-20",
    reason: "Recorded in September for a July event",
    retrospectiveConfirmed: true,
  });

  const otherEvent = await addEvent(tenantB, {
    name: "Other Cup",
    reference: "D-OC",
    eventDate: "2026-09-10",
    venueId: tenantB.northId,
  });
  await cancel(tenantB, {
    staffId: tenantB.alexId,
    eventId: otherEvent.id,
    reportedDate: "2026-09-10",
    reason: "Other tenant",
  });
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

describe("getAbsenceDashboard", () => {
  it("counts active absences on the affected date and compares the previous period", async () => {
    const overview = await load();
    expect(overview.current).toEqual({
      CANCELLATION: 2,
      AWOL: 1,
      SICKNESS: 3,
    });
    expect(overview.previous).toEqual({
      CANCELLATION: 2,
      AWOL: 0,
      SICKNESS: 0,
    });
    const trend = overview.trend.reduce(
      (totals, bucket) => ({
        CANCELLATION: totals.CANCELLATION + bucket.CANCELLATION,
        AWOL: totals.AWOL + bucket.AWOL,
        SICKNESS: totals.SICKNESS + bucket.SICKNESS,
      }),
      { CANCELLATION: 0, AWOL: 0, SICKNESS: 0 },
    );
    expect(trend).toEqual(overview.current);
  });

  it("counts a multi-day sickness episode once and excludes archived rows", async () => {
    const overview = await load();
    expect(overview.current.SICKNESS).toBe(3);
    expect(overview.events.map((event) => event.name)).not.toContain("Archived Cup");
  });

  it("lists staff with two or more absences as counts, without notes or contact details", async () => {
    const overview = await load();
    expect(overview.repeats.map((row) => row.lastName)).toEqual(["Patel", "Reed"]);
    expect(overview.repeats[0]).toMatchObject({
      firstName: "Alex",
      lastName: "Patel",
      roleTitle: "Steward",
      cancellation: 1,
      awol: 1,
      sickness: 1,
      total: 3,
    });
    expect(overview.repeats[1]).toMatchObject({
      firstName: "Sam",
      lastName: "Reed",
      roleTitle: "Supervisor",
      cancellation: 0,
      awol: 0,
      sickness: 2,
      total: 2,
    });
    expect(overview.repeats.map((row) => Object.keys(row).sort())).toEqual([
      [
        "awol",
        "cancellation",
        "firstName",
        "lastName",
        "roleTitle",
        "sickness",
        "staffId",
        "total",
      ],
      [
        "awol",
        "cancellation",
        "firstName",
        "lastName",
        "roleTitle",
        "sickness",
        "staffId",
        "total",
      ],
    ]);
    const json = JSON.stringify(overview);
    expect(json).not.toContain("Secret migraine");
    expect(json).not.toContain("Secret AWOL");
    expect(json).not.toContain("Secret cancellation");
    expect(json).not.toContain("secret-dashboard@");
    expect(json).not.toContain("07000999111");
    expect(json).not.toContain("issueSummary");
    expect(json).not.toContain("Secret staff notes");
  });

  it("keeps sickness when a venue or event filter is applied", async () => {
    const north = await load({ venueId: tenantA.northId });
    expect(north.current).toEqual({
      CANCELLATION: 1,
      AWOL: 1,
      SICKNESS: 3,
    });
    expect(north.previous.CANCELLATION).toBe(1);
    expect(north.venues.map((venue) => venue.name)).toEqual(["North Stand"]);
    expect(north.repeats.map((row) => row.lastName)).toEqual(["Patel", "Reed"]);

    const south = await load({ venueId: tenantA.southId });
    expect(south.current).toEqual({
      CANCELLATION: 1,
      AWOL: 0,
      SICKNESS: 3,
    });
    expect(south.previous.CANCELLATION).toBe(1);
    expect(south.repeats.map((row) => row.lastName)).toEqual(["Reed"]);

    const event = await load({ eventId: northCupId });
    expect(event.current).toEqual({
      CANCELLATION: 1,
      AWOL: 0,
      SICKNESS: 3,
    });
    expect(event.venues).toEqual([]);
    expect(event.events.map((row) => row.name)).toEqual(["North Cup"]);
    expect(event.repeats.find((row) => row.lastName === "Patel")).toMatchObject({
      cancellation: 1,
      awol: 0,
      sickness: 1,
      total: 2,
    });
  });

  it("groups venues and events by cancellation and AWOL only", async () => {
    const overview = await load();
    expect(overview.venues).toEqual([
      {
        venueId: tenantA.northId,
        name: "North Stand",
        cancellation: 1,
        awol: 1,
        total: 2,
      },
      {
        venueId: tenantA.southId,
        name: "South Stand",
        cancellation: 1,
        awol: 0,
        total: 1,
      },
    ]);
    expect(overview.events.map((event) => event.name)).toEqual([
      "North Night",
      "South Cup",
      "North Cup",
    ]);
    expect(overview.events.find((event) => event.eventId === northNightId)).toMatchObject({
      awol: 1,
      cancellation: 0,
      eventDateIso: "2026-09-12",
    });
    expect(overview.events.find((event) => event.eventId === southCupId)?.eventDateIso).toBe(
      "2026-09-11",
    );
  });

  it("does not include another tenant", async () => {
    const overview = await load();
    const other = await getAbsenceDashboard(prisma, tenantB.tenant.id, {
      from: period.range.from,
      to: period.range.to,
      previousFrom: period.range.previousFrom,
      previousTo: period.range.previousTo,
      buckets: period.buckets,
      venueId: null,
      eventId: null,
    });
    expect(overview.repeats.some((row) => row.staffId === tenantB.alexId)).toBe(false);
    expect(other.current).toEqual({
      CANCELLATION: 1,
      AWOL: 0,
      SICKNESS: 0,
    });
    expect(other.repeats).toEqual([]);
  });

  it("lists events in the date range and keeps a selected event from outside it", async () => {
    const options = await listDashboardEventOptions(
      prisma,
      tenantA.tenant.id,
      period.range.from,
      period.range.to,
      "",
    );
    expect(options.map((event) => event.name)).toEqual([
      "North Cup",
      "South Cup",
      "North Night",
      "Archived Cup",
    ]);

    const withOutside = await listDashboardEventOptions(
      prisma,
      tenantA.tenant.id,
      period.range.from,
      period.range.to,
      (
        await prisma.event.findFirstOrThrow({
          where: { tenantId: tenantA.tenant.id, reference: "D-PS" },
        })
      ).id,
    );
    expect(withOutside[0]?.name).toBe("Prev Start");
    expect(withOutside.some((event) => event.name === "North Cup")).toBe(true);
  });
});
