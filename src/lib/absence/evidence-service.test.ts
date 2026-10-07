import { Prisma, Role } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FIT_NOTE_STATUSES, SELF_CERTIFICATION_STATUSES } from "@/lib/absence/catalog";
import { AbsenceAccessError } from "@/lib/absence/errors";
import {
  createFitNote,
  saveSelfCertification,
  updateFitNote,
} from "@/lib/absence/evidence-service";
import { createFollowUp } from "@/lib/absence/follow-up-service";
import { parseHistoryChanges } from "@/lib/absence/history";
import { listAbsencesForLedger } from "@/lib/absence/ledger-query";
import {
  getAbsenceForTenant,
  listActiveAbsencesForStaff,
} from "@/lib/absence/queries";
import { defaultLedgerListQuery } from "@/lib/absence/schema";
import {
  archiveSickness,
  createCancellation,
  createSickness,
} from "@/lib/absence/service";
import { prisma } from "@/lib/db";
import { parseLocalDate } from "@/lib/events/dates";
import { provisionTenantEventCatalog } from "@/lib/events/provision";
import type { EventInput } from "@/lib/events/schema";
import { createEvent } from "@/lib/events/service";
import type { StaffInput } from "@/lib/staff/schema";
import { createStaff } from "@/lib/staff/service";

const prefix = `vitest-evidence-${Date.now()}`;
const now = new Date("2026-09-14T12:00:00.000Z");
const secret = "SECRET_FIT_NOTE_NOTE_99";

type Fixture = {
  tenant: { id: string };
  user: { id: string };
  staffId: string;
  eventId: string;
};

let tenantA: Fixture;
let tenantB: Fixture;

function key() {
  return `evidence-${Math.random().toString(36).slice(2, 12)}`;
}

async function createFixture(label: string): Promise<Fixture> {
  const tenant = await prisma.tenant.create({
    data: {
      name: `Vitest Evidence ${label}`,
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
      name: `Evidence Venue ${label}`,
      nameNormalized: `evidence venue ${label}`,
      timezone: "Europe/London",
      active: true,
    },
  });
  const staff = await createStaff(prisma, {
    tenantId: tenant.id,
    userId: user.id,
    input: {
      staffIdNumber: `EV-${label.toUpperCase()}`,
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
  await prisma.absenceFollowUp.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
  await prisma.sicknessFitNote.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
  await prisma.sicknessSelfCertification.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
  await prisma.absenceFollowUp.deleteMany({
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

async function sickness(firstDay = "2026-09-14") {
  const created = await createSickness(prisma, {
    tenantId: tenantA.tenant.id,
    userId: tenantA.user.id,
    now,
    input: {
      type: "SICKNESS",
      staffId: tenantA.staffId,
      reportedDate: "2026-09-14",
      firstWorkingDaySick: firstDay,
      sicknessStartedDate: null,
      issueSummary: null,
      futureFirstWorkingDayConfirmed: false,
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

describe("sickness evidence", () => {
  it("starts as Not recorded and keeps episode, absence and follow-up state unchanged", async () => {
    const absenceId = await sickness("2026-09-10");
    const before = await getAbsenceForTenant(prisma, tenantA.tenant.id, absenceId);
    expect(before.selfCertification).toBeNull();
    expect(before.fitNotes).toHaveLength(0);
    const followUp = await createFollowUp(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: {
        absenceId,
        dueDate: "2026-09-16",
        details: "Chase the fit note",
        idempotencyKey: key(),
      },
    });
    expect(followUp.ok).toBe(true);

    const saved = await saveSelfCertification(prisma, {
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
    expect(saved.ok).toBe(true);
    const fit = await createFitNote(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      now,
      input: {
        absenceId,
        status: "RECEIVED",
        requestedDate: "2026-09-01",
        receivedDate: "2026-09-12",
        note: secret,
        idempotencyKey: key(),
      },
    });
    expect(fit.ok).toBe(true);

    const after = await getAbsenceForTenant(prisma, tenantA.tenant.id, absenceId);
    expect(after.sickness?.episodeState).toBe(before.sickness?.episodeState);
    expect(after.recordStatus).toBe("ACTIVE");
    expect(after.updatedAt.toISOString()).toBe(before.updatedAt.toISOString());
    expect(after.followUpStatus).toBe("PENDING");
    expect(after.followUps[0]?.state).toBe("OPEN");
    expect(after.followUps[0]?.completedAt).toBeNull();
    expect(after.selfCertification?.status).toBe("AWAITING");
    expect(after.fitNotes).toHaveLength(1);
    expect(after.fitNotes[0]?.note).toBe(secret);
    expect(
      after.history.filter((row) => row.action === "EVIDENCE_RECORDED"),
    ).toHaveLength(2);
  });

  it.each(SELF_CERTIFICATION_STATUSES.filter((status) => status !== "NOT_RECORDED"))(
    "records self-certification status %s",
    async (status) => {
      const absenceId = await sickness(`2026-08-${String(SELF_CERTIFICATION_STATUSES.indexOf(status) + 1).padStart(2, "0")}`);
      const saved = await saveSelfCertification(prisma, {
        tenantId: tenantA.tenant.id,
        userId: tenantA.user.id,
        now,
        input: {
          absenceId,
          status,
          correctionReason: "",
          expectedUpdatedAt: "",
          idempotencyKey: key(),
        },
      });
      expect(saved.ok).toBe(true);
      const row = await prisma.sicknessSelfCertification.findFirstOrThrow({
        where: { absenceId },
      });
      expect(row.status).toBe(status);
    },
  );

  it.each(FIT_NOTE_STATUSES.filter((status) => status !== "NOT_RECORDED"))(
    "records fit note status %s",
    async (status) => {
      const day = 20 + FIT_NOTE_STATUSES.indexOf(status);
      const absenceId = await sickness(`2026-07-${String(day).padStart(2, "0")}`);
      const requestedDate = status === "REQUESTED" || status === "RECEIVED" ? "2026-07-01" : "";
      const receivedDate = status === "RECEIVED" ? "2026-07-02" : "";
      const saved = await createFitNote(prisma, {
        tenantId: tenantA.tenant.id,
        userId: tenantA.user.id,
        now,
        input: {
          absenceId,
          status,
          requestedDate,
          receivedDate,
          note: "",
          idempotencyKey: key(),
        },
      });
      expect(saved.ok).toBe(true);
    },
  );

  it("rejects a first Not recorded self-certification and an empty fit note without a write", async () => {
    const absenceId = await sickness("2026-09-11");
    const selfCert = await saveSelfCertification(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      now,
      input: {
        absenceId,
        status: "NOT_RECORDED",
        correctionReason: "",
        expectedUpdatedAt: "",
        idempotencyKey: key(),
      },
    });
    expect(selfCert.ok).toBe(false);
    const fit = await createFitNote(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      now,
      input: {
        absenceId,
        status: "NOT_RECORDED",
        requestedDate: "",
        receivedDate: "",
        note: "",
        idempotencyKey: key(),
      },
    });
    expect(fit.ok).toBe(false);
    expect(await prisma.sicknessSelfCertification.count({ where: { absenceId } })).toBe(0);
    expect(await prisma.sicknessFitNote.count({ where: { absenceId } })).toBe(0);
    expect(
      await prisma.absenceHistory.count({
        where: { absenceId, action: { in: ["EVIDENCE_RECORDED", "EVIDENCE_CORRECTED"] } },
      }),
    ).toBe(0);
  });

  it("requires a correction reason, rejects no-change, and keeps a correction back to Not recorded", async () => {
    const absenceId = await sickness("2026-09-09");
    const created = await createFitNote(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      now,
      input: {
        absenceId,
        status: "REQUIRED",
        requestedDate: "",
        receivedDate: "",
        note: "First note",
        idempotencyKey: key(),
      },
    });
    if (!created.ok) throw new Error(created.error);
    const row = await prisma.sicknessFitNote.findFirstOrThrow({
      where: { id: created.fitNoteId! },
    });
    const missingReason = await updateFitNote(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      now,
      input: {
        fitNoteId: row.id,
        status: "NOT_REQUIRED",
        requestedDate: "",
        receivedDate: "",
        note: "First note",
        correctionReason: "x",
        expectedUpdatedAt: row.updatedAt.toISOString(),
        idempotencyKey: key(),
      },
    });
    expect(missingReason.ok).toBe(false);
    const unchanged = await updateFitNote(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      now,
      input: {
        fitNoteId: row.id,
        status: "REQUIRED",
        requestedDate: "",
        receivedDate: "",
        note: "First note",
        correctionReason: "No actual change",
        expectedUpdatedAt: row.updatedAt.toISOString(),
        idempotencyKey: key(),
      },
    });
    expect(unchanged.ok).toBe(false);
    expect(
      await prisma.absenceHistory.count({
        where: { absenceId, action: "EVIDENCE_CORRECTED" },
      }),
    ).toBe(0);

    const corrected = await updateFitNote(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      now,
      input: {
        fitNoteId: row.id,
        status: "NOT_RECORDED",
        requestedDate: "",
        receivedDate: "",
        note: "",
        correctionReason: "Entered on the wrong episode",
        expectedUpdatedAt: row.updatedAt.toISOString(),
        idempotencyKey: key(),
      },
    });
    expect(corrected.ok).toBe(true);
    const kept = await prisma.sicknessFitNote.findFirstOrThrow({
      where: { id: row.id },
    });
    expect(kept.status).toBe("NOT_RECORDED");
    const history = await prisma.absenceHistory.findFirstOrThrow({
      where: { absenceId, action: "EVIDENCE_CORRECTED" },
    });
    expect(history.reason).toBe("Entered on the wrong episode");
    expect(parseHistoryChanges(history.changes).some((change) => change.field === "fitNoteStatus")).toBe(true);
  });

  it("accepts a retrospective date and rejects a future date", async () => {
    const absenceId = await sickness("2026-09-08");
    const past = await createFitNote(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      now,
      input: {
        absenceId,
        status: "REQUESTED",
        requestedDate: "2026-01-02",
        receivedDate: "",
        note: "",
        idempotencyKey: key(),
      },
    });
    expect(past.ok).toBe(true);
    const future = await createFitNote(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      now,
      input: {
        absenceId,
        status: "REQUESTED",
        requestedDate: "2026-09-15",
        receivedDate: "",
        note: "",
        idempotencyKey: key(),
      },
    });
    expect(future.ok).toBe(false);
    if (!future.ok) {
      expect(future.fieldErrors?.requestedDate?.[0]).toMatch(/future/);
    }
    expect(await prisma.sicknessFitNote.count({ where: { absenceId } })).toBe(1);
  });

  it("rejects evidence on a cancellation and on an archived sickness record", async () => {
    const cancelled = await cancellation();
    const wrongType = await saveSelfCertification(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      now,
      input: {
        absenceId: cancelled,
        status: "AWAITING",
        correctionReason: "",
        expectedUpdatedAt: "",
        idempotencyKey: key(),
      },
    });
    expect(wrongType.ok).toBe(false);

    const absenceId = await sickness("2026-09-07");
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
    const denied = await createFitNote(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      now,
      input: {
        absenceId,
        status: "REQUIRED",
        requestedDate: "",
        receivedDate: "",
        note: "",
        idempotencyKey: key(),
      },
    });
    expect(denied.ok).toBe(false);
    expect(await prisma.sicknessFitNote.count({ where: { absenceId } })).toBe(0);
  });

  it("denies a cross-tenant read and mutation without a different existence error", async () => {
    const absenceId = await sickness("2026-09-06");
    await expect(
      saveSelfCertification(prisma, {
        tenantId: tenantB.tenant.id,
        userId: tenantB.user.id,
        now,
        input: {
          absenceId,
          status: "AWAITING",
          correctionReason: "",
          expectedUpdatedAt: "",
          idempotencyKey: key(),
        },
      }),
    ).rejects.toBeInstanceOf(AbsenceAccessError);
    await expect(
      getAbsenceForTenant(prisma, tenantB.tenant.id, absenceId),
    ).rejects.toBeInstanceOf(AbsenceAccessError);
    await expect(
      getAbsenceForTenant(prisma, tenantB.tenant.id, "missing-absence"),
    ).rejects.toBeInstanceOf(AbsenceAccessError);
  });

  it("replays an identical create and rejects a payload mismatch", async () => {
    const absenceId = await sickness("2026-09-05");
    const idempotencyKey = key();
    const input = {
      absenceId,
      status: "REQUIRED" as const,
      requestedDate: "",
      receivedDate: "",
      note: "Replay me",
      idempotencyKey,
    };
    const first = await createFitNote(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      now,
      input,
    });
    const second = await createFitNote(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      now,
      input,
    });
    expect(first.ok && second.ok && first.fitNoteId).toBe(
      second.ok && second.fitNoteId,
    );
    expect(await prisma.sicknessFitNote.count({ where: { absenceId } })).toBe(1);
    expect(
      await prisma.absenceHistory.count({
        where: { absenceId, action: "EVIDENCE_RECORDED" },
      }),
    ).toBe(1);
    const mismatch = await createFitNote(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      now,
      input: { ...input, note: "Different note" },
    });
    expect(mismatch.ok).toBe(false);
    expect(await prisma.sicknessFitNote.count({ where: { absenceId } })).toBe(1);
  });

  it("rejects a stale fit note edit", async () => {
    const absenceId = await sickness("2026-09-04");
    const created = await createFitNote(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      now,
      input: {
        absenceId,
        status: "REQUIRED",
        requestedDate: "",
        receivedDate: "",
        note: "",
        idempotencyKey: key(),
      },
    });
    if (!created.ok || !created.fitNoteId) throw new Error("create failed");
    const stale = await updateFitNote(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      now,
      input: {
        fitNoteId: created.fitNoteId,
        status: "NOT_REQUIRED",
        requestedDate: "",
        receivedDate: "",
        note: "",
        correctionReason: "Stale writer",
        expectedUpdatedAt: "2000-01-01T00:00:00.000Z",
        idempotencyKey: key(),
      },
    });
    expect(stale.ok).toBe(false);
    const row = await prisma.sicknessFitNote.findFirstOrThrow({
      where: { id: created.fitNoteId },
    });
    expect(row.status).toBe("REQUIRED");
  });

  it("rolls back the fit note when the history write fails", async () => {
    const absenceId = await sickness("2026-09-03");
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
      createFitNote(db, {
        tenantId: tenantA.tenant.id,
        userId: tenantA.user.id,
        now,
        input: {
          absenceId,
          status: "REQUIRED",
          requestedDate: "",
          receivedDate: "",
          note: "This must roll back",
          idempotencyKey: key(),
        },
      }),
    ).rejects.toThrow("history write failed");
    expect(await prisma.sicknessFitNote.count({ where: { absenceId } })).toBe(0);
    expect(
      await prisma.absenceHistory.count({
        where: { absenceId, action: "EVIDENCE_RECORDED" },
      }),
    ).toBe(0);
  });

  it("keeps the fit note note off the ledger and staff history", async () => {
    const absenceId = await sickness("2026-09-02");
    const created = await createFitNote(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      now,
      input: {
        absenceId,
        status: "REQUIRED",
        requestedDate: "",
        receivedDate: "",
        note: secret,
        idempotencyKey: key(),
      },
    });
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
    expect(detail.fitNotes[0]?.note).toBe(secret);
  });

  it("allows more than one fit note on the same episode", async () => {
    const absenceId = await sickness("2026-09-01");
    const first = await createFitNote(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      now,
      input: {
        absenceId,
        status: "RECEIVED",
        requestedDate: "",
        receivedDate: "2026-08-01",
        note: "",
        idempotencyKey: key(),
      },
    });
    const second = await createFitNote(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      now,
      input: {
        absenceId,
        status: "REQUESTED",
        requestedDate: "2026-08-20",
        receivedDate: "",
        note: "",
        idempotencyKey: key(),
      },
    });
    expect(first.ok && second.ok).toBe(true);
    const detail = await getAbsenceForTenant(prisma, tenantA.tenant.id, absenceId);
    expect(detail.fitNotes.map((row) => row.status)).toEqual([
      "RECEIVED",
      "REQUESTED",
    ]);
    expect(parseLocalDate("2026-08-01")).toBeTruthy();
  });
});
