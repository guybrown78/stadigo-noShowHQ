import { Prisma, Role } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AbsenceAccessError } from "@/lib/absence/errors";
import {
  cancelFollowUp,
  completeFollowUp,
  createFollowUp,
  listFollowUpQueue,
  updateFollowUp,
} from "@/lib/absence/follow-up-service";
import type { FollowUpQueueQuery } from "@/lib/absence/follow-up-schema";
import { parseHistoryChanges } from "@/lib/absence/history";
import {
  getAbsenceForTenant,
  listActiveAbsencesForStaff,
} from "@/lib/absence/queries";
import { defaultLedgerListQuery } from "@/lib/absence/schema";
import {
  archiveCancellation,
  createAwol,
  createCancellation,
  createSickness,
} from "@/lib/absence/service";
import { listAbsencesForLedger } from "@/lib/absence/ledger-query";
import { prisma } from "@/lib/db";
import { parseLocalDate } from "@/lib/events/dates";
import { provisionTenantEventCatalog } from "@/lib/events/provision";
import type { EventInput } from "@/lib/events/schema";
import { createEvent } from "@/lib/events/service";
import type { StaffInput } from "@/lib/staff/schema";
import { createStaff } from "@/lib/staff/service";

const prefix = `vitest-follow-up-${Date.now()}`;
const now = new Date("2026-09-14T12:00:00.000Z");
const today = parseLocalDate("2026-09-14")!;
const secret = "SECRET_FOLLOW_UP_NOTE_99";

type Fixture = {
  tenant: { id: string };
  user: { id: string };
  staffId: string;
  eventId: string;
  awolEventId: string;
  typeId: string;
  subtypeId: string;
  venueId: string;
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
      name: `Vitest Follow-up ${label}`,
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
      name: `Follow-up Venue ${label}`,
      nameNormalized: `follow-up venue ${label}`,
      timezone: "Europe/London",
      active: true,
    },
  });
  const staff = await createStaff(prisma, {
    tenantId: tenant.id,
    userId: user.id,
    input: staffInput(label, `FU-${label.toUpperCase()}`),
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
  const awolEvent = await createEvent(prisma, {
    tenantId: tenant.id,
    userId: user.id,
    input: { ...eventInput, name: `Away ${label}`, reference: `AW-${label.toUpperCase()}`, eventDate: "2026-09-13" },
  });
  if (!awolEvent.ok) throw new Error("Failed to create AWOL fixture event");
  return {
    tenant,
    user,
    staffId: staff.id,
    eventId: event.id,
    awolEventId: awolEvent.id,
    typeId: sporting.id,
    subtypeId: sporting.subtypes[0]!.id,
    venueId: venue.id,
  };
}

async function extraEvent(label: string) {
  const event = await createEvent(prisma, {
    tenantId: tenantA.tenant.id,
    userId: tenantA.user.id,
    input: {
      name: `Extra ${label}`,
      reference: `EX-${label}`,
      eventTypeId: tenantA.typeId,
      eventSubtypeId: tenantA.subtypeId,
      venueId: tenantA.venueId,
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
    },
  });
  if (!event.ok) throw new Error(event.error);
  return event.id;
}

function key() {
  return `follow-${Math.random().toString(36).slice(2, 12)}`;
}

function queue(overrides: Partial<FollowUpQueueQuery> = {}): FollowUpQueueQuery {
  return { q: "", type: "", due: "", page: 1, detail: "", ...overrides };
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
  await prisma.absenceFollowUp.deleteMany({
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
});

async function cancellation(eventId = tenantA.eventId) {
  const created = await createCancellation(prisma, {
    tenantId: tenantA.tenant.id,
    userId: tenantA.user.id,
    input: {
      type: "CANCELLATION",
      staffId: tenantA.staffId,
      eventId,
      reportedDate: "2026-09-12",
      reportedTime: null,
      reason: "Family emergency",
      notes: null,
      retrospectiveConfirmed: false,
    },
  });
  if (!created.ok) throw new Error(created.error);
  return created.id;
}

async function awol() {
  const created = await createAwol(prisma, {
    tenantId: tenantA.tenant.id,
    userId: tenantA.user.id,
    now,
    input: {
      type: "AWOL",
      staffId: tenantA.staffId,
      eventId: tenantA.awolEventId,
      reportedDate: "2026-09-14",
      notes: null,
      sameDayStartUnknownConfirmed: false,
      idempotencyKey: key(),
    },
  });
  if (!created.ok) throw new Error(created.error);
  return created.id;
}

async function sickness(staffId = tenantA.staffId, firstDay = "2026-09-14") {
  const created = await createSickness(prisma, {
    tenantId: tenantA.tenant.id,
    userId: tenantA.user.id,
    now,
    input: {
      type: "SICKNESS",
      staffId,
      reportedDate: "2026-09-14",
      firstWorkingDaySick: firstDay,
      sicknessStartedDate: null,
      issueSummary: "Private issue summary must stay off the queue",
      futureFirstWorkingDayConfirmed: false,
      idempotencyKey: key(),
    },
  });
  if (!created.ok) throw new Error(created.error);
  return created.id;
}

describe("manual follow-ups", () => {
  it("creates one open follow-up and one audit event for each absence type", async () => {
    const ids = [await cancellation(), await awol(), await sickness()];
    for (const absenceId of ids) {
      const created = await createFollowUp(prisma, {
        tenantId: tenantA.tenant.id,
        userId: tenantA.user.id,
        input: {
          absenceId,
          dueDate: "2026-09-13",
          details: `${secret} for ${absenceId}`,
          idempotencyKey: key(),
        },
      });
      expect(created.ok).toBe(true);
      const absence = await getAbsenceForTenant(
        prisma,
        tenantA.tenant.id,
        absenceId,
      );
      expect(absence.recordStatus).toBe("ACTIVE");
      expect(absence.followUpStatus).toBe("PENDING");
      expect(absence.followUps).toHaveLength(1);
      expect(absence.followUps[0]?.state).toBe("OPEN");
      expect(
        absence.history.filter((row) => row.action === "FOLLOW_UP_CREATED"),
      ).toHaveLength(1);
    }
  });

  it("rejects a cross-tenant create without confirming the absence", async () => {
    const absenceId = await sickness(tenantA.staffId, "2026-09-13");
    await expect(
      createFollowUp(prisma, {
        tenantId: tenantB.tenant.id,
        userId: tenantB.user.id,
        input: {
          absenceId,
          dueDate: "2026-09-13",
          details: "Should not be stored",
          idempotencyKey: key(),
        },
      }),
    ).rejects.toBeInstanceOf(AbsenceAccessError);
    await expect(
      getAbsenceForTenant(prisma, tenantB.tenant.id, absenceId),
    ).rejects.toBeInstanceOf(AbsenceAccessError);
  });

  it("rejects invalid text without writing or auditing", async () => {
    const absenceId = await sickness(tenantA.staffId, "2026-09-11");
    const before = await prisma.absenceHistory.count({
      where: { absenceId, action: "FOLLOW_UP_CREATED" },
    });
    const created = await createFollowUp(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: {
        absenceId,
        dueDate: "2026-09-13",
        details: "x",
        idempotencyKey: key(),
      },
    });
    expect(created.ok).toBe(false);
    expect(
      await prisma.absenceFollowUp.count({ where: { absenceId } }),
    ).toBe(0);
    expect(
      await prisma.absenceHistory.count({
        where: { absenceId, action: "FOLLOW_UP_CREATED" },
      }),
    ).toBe(before);
  });

  it("edits, rejects no-change and stale writes, then completes and cancels", async () => {
    const absenceId = await sickness(tenantA.staffId, "2026-09-10");
    const created = await createFollowUp(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: {
        absenceId,
        dueDate: "2026-09-13",
        details: "Call the venue",
        idempotencyKey: key(),
      },
    });
    if (!created.ok) throw new Error(created.error);
    const open = await prisma.absenceFollowUp.findFirstOrThrow({
      where: { id: created.id },
    });
    const unchanged = await updateFollowUp(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: {
        followUpId: open.id,
        dueDate: "2026-09-13",
        details: "Call the venue",
        correctionReason: "No actual change",
        expectedUpdatedAt: open.updatedAt.toISOString(),
        idempotencyKey: key(),
      },
    });
    expect(unchanged.ok).toBe(false);
    expect(
      await prisma.absenceHistory.count({
        where: { absenceId, action: "FOLLOW_UP_UPDATED" },
      }),
    ).toBe(0);

    const stale = await updateFollowUp(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: {
        followUpId: open.id,
        dueDate: "2026-09-20",
        details: "Call the venue tomorrow",
        correctionReason: "Wrong day",
        expectedUpdatedAt: "2000-01-01T00:00:00.000Z",
        idempotencyKey: key(),
      },
    });
    expect(stale.ok).toBe(false);

    const edited = await updateFollowUp(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: {
        followUpId: open.id,
        dueDate: "2026-09-20",
        details: "Call the venue tomorrow",
        correctionReason: "Wrong day",
        expectedUpdatedAt: open.updatedAt.toISOString(),
        idempotencyKey: key(),
      },
    });
    expect(edited.ok).toBe(true);
    const updated = await prisma.absenceFollowUp.findFirstOrThrow({
      where: { id: open.id },
    });
    const correction = await prisma.absenceHistory.findFirstOrThrow({
      where: { absenceId, action: "FOLLOW_UP_UPDATED" },
    });
    expect(correction.reason).toBe("Wrong day");
    expect(parseHistoryChanges(correction.changes).map((change) => change.field)).toEqual(
      expect.arrayContaining(["followUpDueDate", "followUpDetails"]),
    );

    const completed = await completeFollowUp(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      now,
      input: {
        followUpId: updated.id,
        completionNotes: "Spoke to the venue manager",
        expectedUpdatedAt: updated.updatedAt.toISOString(),
        idempotencyKey: key(),
      },
    });
    expect(completed.ok).toBe(true);
    const done = await prisma.absenceFollowUp.findFirstOrThrow({
      where: { id: updated.id },
    });
    expect(done.state).toBe("COMPLETED");
    expect(done.completedById).toBe(tenantA.user.id);
    expect(done.completedAt?.toISOString()).toBe(now.toISOString());
    const parent = await prisma.absence.findFirstOrThrow({
      where: { id: absenceId },
    });
    expect(parent.recordStatus).toBe("ACTIVE");

    const blocked = await cancelFollowUp(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: {
        followUpId: done.id,
        cancellationReason: "Too late",
        expectedUpdatedAt: done.updatedAt.toISOString(),
        idempotencyKey: key(),
      },
    });
    expect(blocked.ok).toBe(false);
    expect(
      (await prisma.absenceFollowUp.findFirstOrThrow({ where: { id: done.id } }))
        .state,
    ).toBe("COMPLETED");
  });

  it("cancels an open follow-up and keeps it out of the queue", async () => {
    const absenceId = await sickness(tenantA.staffId, "2026-09-09");
    const created = await createFollowUp(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: {
        absenceId,
        dueDate: "2026-09-14",
        details: "Check tomorrow",
        idempotencyKey: key(),
      },
    });
    if (!created.ok) throw new Error(created.error);
    const open = await prisma.absenceFollowUp.findFirstOrThrow({
      where: { id: created.id },
    });
    const cancelled = await cancelFollowUp(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      now,
      input: {
        followUpId: open.id,
        cancellationReason: "No longer required",
        expectedUpdatedAt: open.updatedAt.toISOString(),
        idempotencyKey: key(),
      },
    });
    expect(cancelled.ok).toBe(true);
    const row = await prisma.absenceFollowUp.findFirstOrThrow({
      where: { id: open.id },
    });
    expect(row.state).toBe("CANCELLED");
    expect(row.cancelledById).toBe(tenantA.user.id);
    const queueRows = await listFollowUpQueue(
      prisma,
      tenantA.tenant.id,
      queue(),
      today,
    );
    expect(queueRows.rows.some((item) => item.id === open.id)).toBe(false);
    const detail = await getAbsenceForTenant(
      prisma,
      tenantA.tenant.id,
      absenceId,
    );
    expect(detail.followUps.some((item) => item.id === open.id)).toBe(true);
    expect(detail.recordStatus).toBe("ACTIVE");
  });

  it("lets one of two competing terminal requests win", async () => {
    const absenceId = await sickness(tenantA.staffId, "2026-09-08");
    const created = await createFollowUp(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: {
        absenceId,
        dueDate: "2026-09-15",
        details: "Decide later",
        idempotencyKey: key(),
      },
    });
    if (!created.ok) throw new Error(created.error);
    const open = await prisma.absenceFollowUp.findFirstOrThrow({
      where: { id: created.id },
    });
    const [completed, cancelled] = await Promise.all([
      completeFollowUp(prisma, {
        tenantId: tenantA.tenant.id,
        userId: tenantA.user.id,
        now,
        input: {
          followUpId: open.id,
          completionNotes: "Completed in the race",
          expectedUpdatedAt: open.updatedAt.toISOString(),
          idempotencyKey: key(),
        },
      }),
      cancelFollowUp(prisma, {
        tenantId: tenantA.tenant.id,
        userId: tenantA.user.id,
        now,
        input: {
          followUpId: open.id,
          cancellationReason: "Cancelled in the race",
          expectedUpdatedAt: open.updatedAt.toISOString(),
          idempotencyKey: key(),
        },
      }),
    ]);
    const winners = [completed, cancelled].filter((result) => result.ok);
    expect(winners).toHaveLength(1);
    const row = await prisma.absenceFollowUp.findFirstOrThrow({
      where: { id: open.id },
    });
    expect(["COMPLETED", "CANCELLED"]).toContain(row.state);
    const terminalHistory = await prisma.absenceHistory.count({
      where: {
        absenceId,
        action: { in: ["FOLLOW_UP_COMPLETED", "FOLLOW_UP_CANCELLED"] },
      },
    });
    expect(terminalHistory).toBe(1);
  });

  it("replays an identical create and rejects a payload mismatch", async () => {
    const absenceId = await sickness(tenantA.staffId, "2026-09-07");
    const idempotencyKey = key();
    const input = {
      absenceId,
      dueDate: "2026-09-16",
      details: "Replay me",
      idempotencyKey,
    };
    const first = await createFollowUp(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input,
    });
    const second = await createFollowUp(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input,
    });
    expect(first.ok && second.ok && first.id).toBe(second.ok && second.id);
    expect(
      await prisma.absenceFollowUp.count({ where: { absenceId } }),
    ).toBe(1);
    expect(
      await prisma.absenceHistory.count({
        where: { absenceId, action: "FOLLOW_UP_CREATED" },
      }),
    ).toBe(1);
    const mismatch = await createFollowUp(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: { ...input, details: "Different details" },
    });
    expect(mismatch.ok).toBe(false);
    expect(
      await prisma.absenceFollowUp.count({ where: { absenceId } }),
    ).toBe(1);
  });

  it("rolls back the follow-up when the history write fails", async () => {
    const absenceId = await sickness(tenantA.staffId, "2026-09-06");
    const db = new Proxy(prisma, {
      get(target, prop, receiver) {
        if (prop !== "$transaction") {
          return Reflect.get(target, prop, receiver);
        }
        return (
          fn: (tx: Prisma.TransactionClient) => Promise<unknown>,
        ) =>
          target.$transaction(async (tx) => {
            const wrapped = new Proxy(tx, {
              get(txTarget, txProp, txReceiver) {
                if (txProp !== "absenceHistory") {
                  return Reflect.get(txTarget, txProp, txReceiver);
                }
                return {
                  create: async () => {
                    throw new Error("history write failed");
                  },
                };
              },
            });
            return fn(wrapped as Prisma.TransactionClient);
          });
      },
    }) as typeof prisma;
    await expect(
      createFollowUp(db, {
        tenantId: tenantA.tenant.id,
        userId: tenantA.user.id,
        input: {
          absenceId,
          dueDate: "2026-09-18",
          details: "This must roll back",
          idempotencyKey: key(),
        },
      }),
    ).rejects.toThrow("history write failed");
    expect(
      await prisma.absenceFollowUp.count({ where: { absenceId } }),
    ).toBe(0);
    expect(
      await prisma.absenceHistory.count({
        where: { absenceId, action: "FOLLOW_UP_CREATED" },
      }),
    ).toBe(0);
  });

  it("filters, pages and orders the queue without archived parents or raw sickness text", async () => {
    const activeId = await sickness(tenantA.staffId, "2026-09-05");
    const archivedId = await cancellation(await extraEvent("archive"));
    await createFollowUp(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: {
        absenceId: activeId,
        dueDate: "2026-09-13",
        details: secret,
        idempotencyKey: key(),
      },
    });
    await createFollowUp(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: {
        absenceId: activeId,
        dueDate: "2026-09-14",
        details: "Due on the tenant date",
        idempotencyKey: key(),
      },
    });
    await createFollowUp(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: {
        absenceId: activeId,
        dueDate: "2026-09-20",
        details: "Upcoming visit",
        idempotencyKey: key(),
      },
    });
    const archivedFollowUp = await createFollowUp(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: {
        absenceId: archivedId,
        dueDate: "2026-09-01",
        details: "Still open after archive",
        idempotencyKey: key(),
      },
    });
    if (!archivedFollowUp.ok) throw new Error(archivedFollowUp.error);
    const archived = await archiveCancellation(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      absenceId: archivedId,
      input: { archiveReason: "No longer needed", confirmArchive: true },
    });
    expect(archived.ok).toBe(true);
    const stillOpen = await prisma.absenceFollowUp.findFirstOrThrow({
      where: { id: archivedFollowUp.id },
    });
    expect(stillOpen.state).toBe("OPEN");
    const denied = await createFollowUp(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: {
        absenceId: archivedId,
        dueDate: "2026-09-21",
        details: "Should be rejected",
        idempotencyKey: key(),
      },
    });
    expect(denied.ok).toBe(false);

    const overdue = await listFollowUpQueue(
      prisma,
      tenantA.tenant.id,
      queue({ due: "overdue", type: "SICKNESS" }),
      today,
    );
    expect(overdue.rows.every((row) => row.absenceType === "SICKNESS")).toBe(
      true,
    );
    expect(overdue.rows.every((row) => row.dueState === "overdue")).toBe(true);
    expect(overdue.rows.some((row) => row.details === secret)).toBe(true);
    expect(
      overdue.rows.some((row) => row.context.join(" ").includes("Private issue")),
    ).toBe(false);

    const named = await listFollowUpQueue(
      prisma,
      tenantA.tenant.id,
      queue({ q: "Cole a" }),
      today,
    );
    expect(named.total).toBeGreaterThan(0);
    const byId = await listFollowUpQueue(
      prisma,
      tenantA.tenant.id,
      queue({ q: "FU-A" }),
      today,
    );
    expect(byId.total).toBeGreaterThan(0);
    const otherTenant = await listFollowUpQueue(
      prisma,
      tenantB.tenant.id,
      queue({ q: secret }),
      today,
    );
    expect(otherTenant.total).toBe(0);

    const all = await listFollowUpQueue(
      prisma,
      tenantA.tenant.id,
      queue(),
      today,
    );
    expect(all.rows.some((row) => row.id === archivedFollowUp.id)).toBe(false);
    const dueOrder = all.rows.map((row) => row.dueState);
    const firstUpcoming = dueOrder.indexOf("upcoming");
    const lastOverdue = dueOrder.lastIndexOf("overdue");
    if (firstUpcoming >= 0 && lastOverdue >= 0) {
      expect(lastOverdue).toBeLessThan(firstUpcoming);
    }

    for (let index = 0; index < 26; index += 1) {
      await createFollowUp(prisma, {
        tenantId: tenantA.tenant.id,
        userId: tenantA.user.id,
        input: {
          absenceId: activeId,
          dueDate: "2026-08-01",
          details: `Paged follow-up ${index}`,
          idempotencyKey: key(),
        },
      });
    }
    const page = await listFollowUpQueue(
      prisma,
      tenantA.tenant.id,
      queue({ page: 2, due: "overdue" }),
      today,
    );
    expect(page.pageCount).toBeGreaterThan(1);
    expect(page.rows.length).toBeGreaterThan(0);
    expect(page.rows.every((row) => row.dueState === "overdue")).toBe(true);

    const ledger = await listAbsencesForLedger(
      prisma,
      tenantA.tenant.id,
      defaultLedgerListQuery(),
    );
    expect(JSON.stringify(ledger)).not.toContain(secret);
    const staffHistory = await listActiveAbsencesForStaff(
      prisma,
      tenantA.tenant.id,
      tenantA.staffId,
    );
    expect(JSON.stringify(staffHistory)).not.toContain(secret);
    expect(
      staffHistory.absences.some((absence) => absence.followUpRecorded),
    ).toBe(true);
  });
});
