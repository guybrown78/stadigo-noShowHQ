import { Prisma, Role } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RETURN_TO_WORK_STATUSES } from "@/lib/absence/catalog";
import { AbsenceAccessError } from "@/lib/absence/errors";
import { saveSelfCertification } from "@/lib/absence/evidence-service";
import {
  completeFollowUp,
  createFollowUp,
} from "@/lib/absence/follow-up-service";
import { parseHistoryChanges } from "@/lib/absence/history";
import { listAbsencesForLedger } from "@/lib/absence/ledger-query";
import {
  getAbsenceForTenant,
  listActiveAbsencesForStaff,
} from "@/lib/absence/queries";
import { saveReturnToWork } from "@/lib/absence/return-to-work-service";
import { defaultLedgerListQuery, type UpdateSicknessEpisodeInput } from "@/lib/absence/schema";
import {
  archiveSickness,
  createCancellation,
  createSickness,
  updateSicknessEpisode,
} from "@/lib/absence/service";
import { prisma } from "@/lib/db";
import { provisionTenantEventCatalog } from "@/lib/events/provision";
import type { EventInput } from "@/lib/events/schema";
import { createEvent } from "@/lib/events/service";
import type { StaffInput } from "@/lib/staff/schema";
import { createStaff } from "@/lib/staff/service";

const prefix = `vitest-rtw-${Date.now()}`;
const now = new Date("2026-09-14T12:00:00.000Z");
const secret = "SECRET_RETURN_TO_WORK_NOTE_99";

type Fixture = {
  tenant: { id: string };
  user: { id: string };
  staffId: string;
  eventId: string;
};

let tenantA: Fixture;
let tenantB: Fixture;
let day = 1;

function key() {
  return `rtw-${Math.random().toString(36).slice(2, 12)}`;
}

function nextDay() {
  const value = `2026-08-${String(day).padStart(2, "0")}`;
  day += 1;
  return value;
}

function position(overrides: Record<string, string> = {}) {
  return {
    status: "OUTSTANDING" as const,
    completedOn: "",
    note: "",
    correctionReason: "",
    expectedUpdatedAt: "",
    idempotencyKey: key(),
    ...overrides,
  };
}

async function createFixture(label: string): Promise<Fixture> {
  const tenant = await prisma.tenant.create({
    data: {
      name: `Vitest Return ${label}`,
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
      name: `Return Venue ${label}`,
      nameNormalized: `return venue ${label}`,
      timezone: "Europe/London",
      active: true,
    },
  });
  const staff = await createStaff(prisma, {
    tenantId: tenant.id,
    userId: user.id,
    input: {
      staffIdNumber: `RTW-${label.toUpperCase()}`,
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
    } satisfies StaffInput,
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
  return { tenant, user, staffId: staff.id, eventId: event.id };
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
  await prisma.sicknessReturnToWork.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
  await prisma.absenceFollowUp.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
  await prisma.sicknessFitNote.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
  await prisma.sicknessSelfCertification.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
  await prisma.sicknessDetail.deleteMany({
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

async function sickness() {
  const created = await createSickness(prisma, {
    tenantId: tenantA.tenant.id,
    userId: tenantA.user.id,
    now,
    input: {
      type: "SICKNESS",
      staffId: tenantA.staffId,
      reportedDate: "2026-09-14",
      firstWorkingDaySick: nextDay(),
      sicknessStartedDate: null,
      issueSummary: null,
      futureFirstWorkingDayConfirmed: false,
      episodeState: "NOT_CONFIRMED",
      sicknessEndedDate: null,
      idempotencyKey: key(),
    },
  });
  if (!created.ok) throw new Error(created.error);
  return created.id;
}

async function cancellation() {
  const created = await createCancellation(prisma, {
    tenantId: tenantA.tenant.id,
    userId: tenantA.user.id,
    input: {
      type: "CANCELLATION",
      staffId: tenantA.staffId,
      eventId: tenantA.eventId,
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

function episodeInput(
  expectedUpdatedAt: string,
  overrides: Partial<UpdateSicknessEpisodeInput> = {},
): UpdateSicknessEpisodeInput {
  return {
    episodeState: "ONGOING",
    sicknessEndedDate: null,
    correctionReason: null,
    confirmClearEndDate: false,
    expectedUpdatedAt,
    idempotencyKey: key(),
    ...overrides,
  };
}

async function save(
  absenceId: string,
  overrides: Record<string, string> = {},
  at = now,
) {
  return saveReturnToWork(prisma, {
    tenantId: tenantA.tenant.id,
    userId: tenantA.user.id,
    now: at,
    input: { absenceId, ...position(overrides) },
  });
}

describe("sickness return to work", () => {
  it("starts as Not recorded and does not change the episode, evidence, or absence", async () => {
    const absenceId = await sickness();
    const before = await getAbsenceForTenant(prisma, tenantA.tenant.id, absenceId);
    expect(before.returnToWork).toBeNull();
    expect(before.sickness?.episodeState).toBe("NOT_CONFIRMED");
    const unchanged = await save(absenceId, { status: "NOT_RECORDED" });
    expect(unchanged.ok).toBe(false);
    expect(await prisma.sicknessReturnToWork.count({ where: { absenceId } })).toBe(0);
    expect(
      await prisma.absenceHistory.count({
        where: { absenceId, action: "RETURN_TO_WORK_RECORDED" },
      }),
    ).toBe(0);

    const recorded = await save(absenceId, { status: "OUTSTANDING", note: secret });
    expect(recorded.ok).toBe(true);
    const after = await getAbsenceForTenant(prisma, tenantA.tenant.id, absenceId);
    expect(after.returnToWork?.status).toBe("OUTSTANDING");
    expect(after.returnToWork?.note).toBe(secret);
    expect(after.sickness?.episodeState).toBe("NOT_CONFIRMED");
    expect(after.selfCertification).toBeNull();
    expect(after.recordStatus).toBe("ACTIVE");
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    expect(
      after.history.filter((row) => row.action === "RETURN_TO_WORK_RECORDED"),
    ).toHaveLength(1);
  });

  it("records every status on Not confirmed, Ongoing, and Ended episodes", async () => {
    const unconfirmed = await sickness();
    expect((await save(unconfirmed, { status: "NOT_REQUIRED" })).ok).toBe(true);

    const ongoingId = await sickness();
    const ongoingAbsence = await prisma.absence.findFirstOrThrow({
      where: { id: ongoingId },
    });
    const ongoing = await updateSicknessEpisode(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      absenceId: ongoingId,
      now,
      input: episodeInput(ongoingAbsence.updatedAt.toISOString()),
    });
    expect(ongoing.ok).toBe(true);
    expect((await save(ongoingId, { status: "OUTSTANDING" })).ok).toBe(true);

    const endedId = await sickness();
    const endedAbsence = await prisma.absence.findFirstOrThrow({
      where: { id: endedId },
    });
    const firstDay = (
      await prisma.sicknessDetail.findFirstOrThrow({ where: { absenceId: endedId } })
    ).firstWorkingDaySick;
    const ended = await updateSicknessEpisode(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      absenceId: endedId,
      now,
      input: episodeInput(endedAbsence.updatedAt.toISOString(), {
        episodeState: "ENDED",
        sicknessEndedDate: firstDay.toISOString().slice(0, 10),
      }),
    });
    expect(ended.ok).toBe(true);
    const completed = await save(endedId, {
      status: "COMPLETED",
      completedOn: "2026-08-20",
    });
    expect(completed.ok).toBe(true);
    const detail = await getAbsenceForTenant(prisma, tenantA.tenant.id, endedId);
    expect(detail.sickness?.episodeState).toBe("ENDED");
    expect(detail.returnToWork?.status).toBe("COMPLETED");
    expect(detail.recordStatus).toBe("ACTIVE");
    expect(RETURN_TO_WORK_STATUSES).toContain(detail.returnToWork?.status);
  });

  it("requires a completion date only for Completed and rejects future dates", async () => {
    const absenceId = await sickness();
    const missing = await save(absenceId, { status: "COMPLETED", completedOn: "" });
    expect(missing.ok).toBe(false);
    const wrongStatus = await save(absenceId, {
      status: "OUTSTANDING",
      completedOn: "2026-08-01",
    });
    expect(wrongStatus.ok).toBe(false);
    const future = await save(absenceId, {
      status: "COMPLETED",
      completedOn: "2026-09-15",
    });
    expect(future.ok).toBe(false);
    if (!future.ok) {
      expect(future.fieldErrors?.completedOn?.[0]).toMatch(/future/);
    }
    expect(await prisma.sicknessReturnToWork.count({ where: { absenceId } })).toBe(0);
    expect(
      await prisma.absenceHistory.count({
        where: {
          absenceId,
          action: { in: ["RETURN_TO_WORK_RECORDED", "RETURN_TO_WORK_CORRECTED"] },
        },
      }),
    ).toBe(0);

    const retrospective = await save(absenceId, {
      status: "COMPLETED",
      completedOn: "2026-08-01",
      note: "Recorded later",
    });
    expect(retrospective.ok).toBe(true);
  });

  it("uses the tenant-local date around midnight", async () => {
    const beforeMidnight = new Date("2026-09-14T22:30:00.000Z");
    const afterMidnight = new Date("2026-09-14T23:30:00.000Z");
    const early = await sickness();
    const rejected = await save(
      early,
      { status: "COMPLETED", completedOn: "2026-09-15" },
      beforeMidnight,
    );
    expect(rejected.ok).toBe(false);
    const late = await sickness();
    const accepted = await save(
      late,
      { status: "COMPLETED", completedOn: "2026-09-15" },
      afterMidnight,
    );
    expect(accepted.ok).toBe(true);
    const retrospective = await save(
      (
        await sickness()
      ),
      { status: "COMPLETED", completedOn: "2026-09-14" },
      afterMidnight,
    );
    expect(retrospective.ok).toBe(true);
  });

  it("requires a reason for a saved change, rejects no-change, and clears a completion date", async () => {
    const absenceId = await sickness();
    const created = await save(absenceId, {
      status: "COMPLETED",
      completedOn: "2026-08-02",
      note: "First note",
    });
    expect(created.ok).toBe(true);
    const row = await prisma.sicknessReturnToWork.findFirstOrThrow({
      where: { absenceId },
    });
    const missingReason = await save(absenceId, {
      status: "OUTSTANDING",
      correctionReason: "x",
      expectedUpdatedAt: row.updatedAt.toISOString(),
    });
    expect(missingReason.ok).toBe(false);
    const same = await save(absenceId, {
      status: "COMPLETED",
      completedOn: "2026-08-02",
      note: "First note",
      correctionReason: "No actual change",
      expectedUpdatedAt: row.updatedAt.toISOString(),
    });
    expect(same.ok).toBe(false);
    expect(
      await prisma.absenceHistory.count({
        where: { absenceId, action: "RETURN_TO_WORK_CORRECTED" },
      }),
    ).toBe(0);

    const corrected = await save(absenceId, {
      status: "OUTSTANDING",
      note: "Still open",
      correctionReason: "Meeting did not happen",
      expectedUpdatedAt: row.updatedAt.toISOString(),
    });
    expect(corrected.ok).toBe(true);
    const after = await prisma.sicknessReturnToWork.findFirstOrThrow({
      where: { absenceId },
    });
    expect(after.status).toBe("OUTSTANDING");
    expect(after.completedOn).toBeNull();
    const history = await prisma.absenceHistory.findFirstOrThrow({
      where: { absenceId, action: "RETURN_TO_WORK_CORRECTED" },
    });
    const changes = parseHistoryChanges(history.changes);
    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "returnToWorkCompletedOn",
          previous: "2026-08-02",
          next: null,
        }),
        expect.objectContaining({
          field: "returnToWorkStatus",
          previous: "COMPLETED",
          next: "OUTSTANDING",
        }),
      ]),
    );
    expect(history.reason).toBe("Meeting did not happen");
    const detail = await getAbsenceForTenant(prisma, tenantA.tenant.id, absenceId);
    expect(
      detail.history.filter((entry) =>
        String(entry.action).startsWith("RETURN_TO_WORK"),
      ),
    ).toHaveLength(2);
  });

  it("rejects return to work on a cancellation and on an archived sickness record", async () => {
    const cancelled = await cancellation();
    const wrongType = await save(cancelled, { status: "OUTSTANDING" });
    expect(wrongType.ok).toBe(false);

    const absenceId = await sickness();
    const existing = await prisma.absence.findFirstOrThrow({
      where: { id: absenceId },
    });
    const archived = await archiveSickness(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      absenceId,
      input: {
        archiveReason: "Entered against the wrong person",
        confirmArchive: true,
        expectedUpdatedAt: existing.updatedAt.toISOString(),
      },
    });
    if (!archived.ok) throw new Error(archived.error);
    const denied = await save(absenceId, { status: "OUTSTANDING" });
    expect(denied.ok).toBe(false);
    expect(await prisma.sicknessReturnToWork.count({ where: { absenceId } })).toBe(0);
  });

  it("denies a cross-tenant read and mutation without a different existence error", async () => {
    const absenceId = await sickness();
    await expect(
      saveReturnToWork(prisma, {
        tenantId: tenantB.tenant.id,
        userId: tenantB.user.id,
        now,
        input: { absenceId, ...position() },
      }),
    ).rejects.toBeInstanceOf(AbsenceAccessError);
    await expect(
      getAbsenceForTenant(prisma, tenantB.tenant.id, absenceId),
    ).rejects.toBeInstanceOf(AbsenceAccessError);
    await expect(
      getAbsenceForTenant(prisma, tenantB.tenant.id, "missing-absence"),
    ).rejects.toBeInstanceOf(AbsenceAccessError);
  });

  it("replays an identical save and rejects a payload mismatch", async () => {
    const absenceId = await sickness();
    const idempotencyKey = key();
    const input = {
      absenceId,
      ...position({ status: "NOT_REQUIRED", note: "Replay me", idempotencyKey }),
    };
    const first = await saveReturnToWork(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      now,
      input,
    });
    const second = await saveReturnToWork(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      now,
      input,
    });
    expect(first.ok && second.ok).toBe(true);
    expect(await prisma.sicknessReturnToWork.count({ where: { absenceId } })).toBe(1);
    expect(
      await prisma.absenceHistory.count({
        where: { absenceId, action: "RETURN_TO_WORK_RECORDED" },
      }),
    ).toBe(1);
    const mismatch = await saveReturnToWork(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      now,
      input: { ...input, note: "Different note" },
    });
    expect(mismatch.ok).toBe(false);
    expect(await prisma.sicknessReturnToWork.count({ where: { absenceId } })).toBe(1);
  });

  it("rejects a stale edit", async () => {
    const absenceId = await sickness();
    const created = await save(absenceId, { status: "OUTSTANDING" });
    expect(created.ok).toBe(true);
    const stale = await save(absenceId, {
      status: "NOT_REQUIRED",
      correctionReason: "Stale writer",
      expectedUpdatedAt: "2000-01-01T00:00:00.000Z",
    });
    expect(stale.ok).toBe(false);
    const row = await prisma.sicknessReturnToWork.findFirstOrThrow({
      where: { absenceId },
    });
    expect(row.status).toBe("OUTSTANDING");
  });

  it("rolls back the row when the history write fails", async () => {
    const absenceId = await sickness();
    const db = new Proxy(prisma, {
      get(target, prop, receiver) {
        if (prop !== "$transaction") {
          return Reflect.get(target, prop, receiver);
        }
        return (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
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
      saveReturnToWork(db, {
        tenantId: tenantA.tenant.id,
        userId: tenantA.user.id,
        now,
        input: {
          absenceId,
          ...position({ status: "OUTSTANDING", note: "This must roll back" }),
        },
      }),
    ).rejects.toThrow("history write failed");
    expect(await prisma.sicknessReturnToWork.count({ where: { absenceId } })).toBe(0);
    expect(
      await prisma.absenceHistory.count({
        where: { absenceId, action: "RETURN_TO_WORK_RECORDED" },
      }),
    ).toBe(0);
  });

  it("keeps the note off the ledger and staff history", async () => {
    const absenceId = await sickness();
    const created = await save(absenceId, { status: "OUTSTANDING", note: secret });
    expect(created.ok).toBe(true);
    const ledger = await listAbsencesForLedger(prisma, tenantA.tenant.id, {
      ...defaultLedgerListQuery("sickness"),
      view: "sickness",
    });
    expect(JSON.stringify(ledger)).not.toContain(secret);
    const history = await listActiveAbsencesForStaff(
      prisma,
      tenantA.tenant.id,
      tenantA.staffId,
    );
    expect(JSON.stringify(history)).not.toContain(secret);
    const detail = await getAbsenceForTenant(prisma, tenantA.tenant.id, absenceId);
    expect(detail.returnToWork?.note).toBe(secret);
    expect(JSON.stringify(detail.history)).toContain(secret);
  });

  it("does not change follow-ups or evidence, and those saves do not change return to work", async () => {
    const absenceId = await sickness();
    const followUp = await createFollowUp(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: {
        absenceId,
        dueDate: "2026-09-20",
        details: "Call the manager",
        idempotencyKey: key(),
      },
    });
    if (!followUp.ok) throw new Error(followUp.error);
    const recorded = await save(absenceId, { status: "OUTSTANDING" });
    expect(recorded.ok).toBe(true);
    const open = await prisma.absenceFollowUp.findFirstOrThrow({
      where: { id: followUp.id },
    });
    expect(open.state).toBe("OPEN");
    const parent = await prisma.absence.findFirstOrThrow({ where: { id: absenceId } });
    expect(parent.followUpStatus).toBe("PENDING");

    const completed = await completeFollowUp(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      now,
      input: {
        followUpId: open.id,
        completionNotes: "Spoke to the manager",
        expectedUpdatedAt: open.updatedAt.toISOString(),
        idempotencyKey: key(),
      },
    });
    expect(completed.ok).toBe(true);
    const afterFollowUp = await prisma.sicknessReturnToWork.findFirstOrThrow({
      where: { absenceId },
    });
    expect(afterFollowUp.status).toBe("OUTSTANDING");

    const evidence = await saveSelfCertification(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      now,
      input: {
        absenceId,
        status: "AWAITING",
        correctionReason: "",
        expectedUpdatedAt: "",
        idempotencyKey: key(),
      },
    });
    expect(evidence.ok).toBe(true);
    const afterEvidence = await prisma.sicknessReturnToWork.findFirstOrThrow({
      where: { absenceId },
    });
    expect(afterEvidence.status).toBe("OUTSTANDING");
    expect(afterEvidence.updatedAt.getTime()).toBe(afterFollowUp.updatedAt.getTime());

    const current = await prisma.absence.findFirstOrThrow({ where: { id: absenceId } });
    const episode = await updateSicknessEpisode(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      absenceId,
      now,
      input: episodeInput(current.updatedAt.toISOString()),
    });
    expect(episode.ok).toBe(true);
    const afterEpisode = await getAbsenceForTenant(
      prisma,
      tenantA.tenant.id,
      absenceId,
    );
    expect(afterEpisode.sickness?.episodeState).toBe("ONGOING");
    expect(afterEpisode.returnToWork?.status).toBe("OUTSTANDING");
    expect(afterEpisode.selfCertification?.status).toBe("AWAITING");
    expect(afterEpisode.followUps[0]?.state).toBe("COMPLETED");
  });
});
