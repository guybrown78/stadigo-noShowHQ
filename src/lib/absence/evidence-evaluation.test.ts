import { Role } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applySicknessEvidenceBackfill,
  getSicknessEvidenceSettings,
  previewSicknessEvidenceBackfill,
  updateSicknessEvidenceSettings,
} from "@/lib/absence/evidence-settings";
import {
  CHASE_FIT_NOTE_DETAILS,
  REQUEST_FIT_NOTE_DETAILS,
} from "@/lib/absence/evidence-policy";
import {
  evaluateSicknessEvidenceForAbsence,
  evaluateTenantSicknessEvidence,
} from "@/lib/absence/evidence-evaluation";
import { createFitNote, updateFitNote } from "@/lib/absence/evidence-service";
import { completeFollowUp, createFollowUp } from "@/lib/absence/follow-up-service";
import { listAbsencesForLedger } from "@/lib/absence/ledger-query";
import { createSickness, updateSicknessEpisode } from "@/lib/absence/service";
import { defaultLedgerListQuery, type SicknessInput } from "@/lib/absence/schema";
import { prisma } from "@/lib/db";
import { formatLocalDateIso } from "@/lib/events/dates";
import type { StaffInput } from "@/lib/staff/schema";
import { createStaff } from "@/lib/staff/service";

const prefix = `vitest-evidence-policy-${Date.now()}`;
const now = new Date("2026-10-08T11:00:00.000Z");

type Fixture = {
  tenant: { id: string };
  user: { id: string };
  staffId: string;
};

let tenantA: Fixture;
let tenantB: Fixture;

function key() {
  return `policy-${Math.random().toString(36).slice(2, 12)}`;
}

function sicknessInput(
  fixture: Fixture,
  overrides: Partial<SicknessInput> = {},
): SicknessInput {
  return {
    type: "SICKNESS",
    staffId: fixture.staffId,
    reportedDate: "2026-10-01",
    firstWorkingDaySick: "2026-10-01",
    sicknessStartedDate: null,
    issueSummary: "Do not copy this summary",
    futureFirstWorkingDayConfirmed: false,
    idempotencyKey: key(),
    ...overrides,
  };
}

async function createFixture(label: string): Promise<Fixture> {
  const tenant = await prisma.tenant.create({
    data: {
      name: `Vitest Evidence Policy ${label}`,
      slug: `${prefix}-${label}`.toLowerCase(),
      timezone: "Europe/London",
    },
  });
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
  const staff = await createStaff(prisma, {
    tenantId: tenant.id,
    userId: user.id,
    input: {
      staffIdNumber: `EP-${label.toUpperCase()}`,
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
  if (!staff.ok) throw new Error("staff");
  return { tenant, user, staffId: staff.id };
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
  await prisma.absenceFollowUp.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
  await prisma.absenceHistory.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
  await prisma.sicknessFitNote.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
  await prisma.sicknessDetail.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
  await prisma.absence.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.sicknessEvidenceEvaluationRun.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
  await prisma.tenantSettingsAudit.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
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
  await prisma.tenant.updateMany({
    where: { id: { in: tenantIds } },
    data: {
      sicknessEvidenceUpdatedById: null,
      defaultProbationUpdatedById: null,
    },
  });
  await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  await prisma.$disconnect();
});

async function report(fixture: Fixture, firstWorkingDaySick = "2026-10-01") {
  const created = await createSickness(prisma, {
    tenantId: fixture.tenant.id,
    userId: fixture.user.id,
    now,
    input: sicknessInput(fixture, { firstWorkingDaySick, reportedDate: firstWorkingDaySick }),
  });
  if (!created.ok) throw new Error(created.error);
  return created.id;
}

describe("sickness evidence settings", () => {
  it("starts at day 8 and 5, audits a valid change, and leaves the other tenant", async () => {
    const initial = await getSicknessEvidenceSettings(prisma, tenantA.tenant.id);
    expect(initial.requiredFromDay).toBe(8);
    expect(initial.chaseAfterDays).toBe(5);
    const rejected = await updateSicknessEvidenceSettings(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      requiredFromDay: 0,
      chaseAfterDays: 5,
    });
    expect(rejected.ok).toBe(false);
    expect(
      await prisma.tenantSettingsAudit.count({
        where: { tenantId: tenantA.tenant.id },
      }),
    ).toBe(0);

    const saved = await updateSicknessEvidenceSettings(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      requiredFromDay: 10,
      chaseAfterDays: 4,
    });
    expect(saved.ok).toBe(true);
    const other = await getSicknessEvidenceSettings(prisma, tenantB.tenant.id);
    expect(other.requiredFromDay).toBe(8);
    expect(other.chaseAfterDays).toBe(5);
    const audits = await prisma.tenantSettingsAudit.findMany({
      where: { tenantId: tenantA.tenant.id },
      orderBy: { field: "asc" },
    });
    expect(audits.map((row) => [row.field, row.previous, row.next, row.actorId])).toEqual([
      ["fitNoteChaseAfterDays", "5", "4", tenantA.user.id],
      ["fitNoteRequiredFromDay", "8", "10", tenantA.user.id],
    ]);
    await updateSicknessEvidenceSettings(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      requiredFromDay: 8,
      chaseAfterDays: 5,
    });
  });
});

describe("sickness evidence evaluation", () => {
  it("snapshots policy, creates one request task, and ignores repeated runs", async () => {
    const absenceId = await report(tenantA, "2026-10-01");
    const created = await prisma.sicknessDetail.findUniqueOrThrow({
      where: { absenceId },
    });
    expect(created.evidenceRequiredFromDay).toBe(8);
    expect(formatLocalDateIso(created.evidenceRequirementDate!)).toBe("2026-10-08");
    expect(
      await prisma.absenceFollowUp.count({ where: { absenceId } }),
    ).toBe(0);

    await updateSicknessEvidenceSettings(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      requiredFromDay: 12,
      chaseAfterDays: 9,
    });
    const unchanged = await prisma.sicknessDetail.findUniqueOrThrow({
      where: { absenceId },
    });
    expect(unchanged.evidenceRequiredFromDay).toBe(8);

    const absence = await prisma.absence.findUniqueOrThrow({
      where: { id: absenceId },
    });
    const ongoing = await updateSicknessEpisode(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      absenceId,
      now,
      input: {
        episodeState: "ONGOING",
        sicknessEndedDate: null,
        correctionReason: null,
        confirmClearEndDate: false,
        expectedUpdatedAt: absence.updatedAt.toISOString(),
        idempotencyKey: key(),
      },
    });
    expect(ongoing.ok).toBe(true);

    await Promise.all([
      prisma.$transaction((tx) =>
        evaluateSicknessEvidenceForAbsence(tx, {
          tenantId: tenantA.tenant.id,
          absenceId,
          now,
        }),
      ),
      prisma.$transaction((tx) =>
        evaluateSicknessEvidenceForAbsence(tx, {
          tenantId: tenantA.tenant.id,
          absenceId,
          now,
        }),
      ),
    ]);

    const tasks = await prisma.absenceFollowUp.findMany({ where: { absenceId } });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.purpose).toBe("REQUEST_FIT_NOTE");
    expect(tasks[0]?.provenance).toBe("SYSTEM");
    expect(tasks[0]?.details).toBe(REQUEST_FIT_NOTE_DETAILS);
    expect(tasks[0]?.details).not.toContain("Do not copy");
    const createdHistory = await prisma.absenceHistory.count({
      where: { absenceId, action: "FOLLOW_UP_CREATED", systemActor: true },
    });
    expect(createdHistory).toBe(1);

    await updateSicknessEvidenceSettings(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      requiredFromDay: 8,
      chaseAfterDays: 5,
    });
  });

  it("keeps a day-7 ended episode below the threshold and applies day 8 retrospectively", async () => {
    const shortId = await report(tenantB, "2026-10-01");
    const short = await prisma.absence.findUniqueOrThrow({ where: { id: shortId } });
    const endedShort = await updateSicknessEpisode(prisma, {
      tenantId: tenantB.tenant.id,
      userId: tenantB.user.id,
      absenceId: shortId,
      now,
      input: {
        episodeState: "ENDED",
        sicknessEndedDate: "2026-10-07",
        correctionReason: null,
        confirmClearEndDate: false,
        expectedUpdatedAt: short.updatedAt.toISOString(),
        idempotencyKey: key(),
      },
    });
    expect(endedShort.ok).toBe(true);
    expect(await prisma.absenceFollowUp.count({ where: { absenceId: shortId } })).toBe(0);

    const longId = await report(tenantB, "2026-09-01");
    const long = await prisma.absence.findUniqueOrThrow({ where: { id: longId } });
    const endedLong = await updateSicknessEpisode(prisma, {
      tenantId: tenantB.tenant.id,
      userId: tenantB.user.id,
      absenceId: longId,
      now,
      input: {
        episodeState: "ENDED",
        sicknessEndedDate: "2026-09-08",
        correctionReason: null,
        confirmClearEndDate: false,
        expectedUpdatedAt: long.updatedAt.toISOString(),
        idempotencyKey: key(),
      },
    });
    expect(endedLong.ok).toBe(true);
    const request = await prisma.absenceFollowUp.findFirstOrThrow({
      where: { absenceId: longId, purpose: "REQUEST_FIT_NOTE" },
    });
    expect(formatLocalDateIso(request.dueDate)).toBe("2026-09-08");
  });

  it("links requested and received only to their system tasks", async () => {
    const absenceId = await report(tenantA, "2026-09-15");
    const absence = await prisma.absence.findUniqueOrThrow({ where: { id: absenceId } });
    await updateSicknessEpisode(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      absenceId,
      now,
      input: {
        episodeState: "ONGOING",
        sicknessEndedDate: null,
        correctionReason: null,
        confirmClearEndDate: false,
        expectedUpdatedAt: absence.updatedAt.toISOString(),
        idempotencyKey: key(),
      },
    });
    const manual = await createFollowUp(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: {
        absenceId,
        dueDate: "2026-10-09",
        details: "Manual check",
        idempotencyKey: key(),
      },
    });
    expect(manual.ok).toBe(true);

    const requested = await createFitNote(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      now,
      input: {
        absenceId,
        status: "REQUESTED",
        requestedDate: "2026-10-08",
        receivedDate: "",
        note: "Private note",
        idempotencyKey: key(),
      },
    });
    expect(requested.ok).toBe(true);
    if (!requested.ok || !requested.fitNoteId) throw new Error("fit note");

    const requestTask = await prisma.absenceFollowUp.findFirstOrThrow({
      where: { absenceId, purpose: "REQUEST_FIT_NOTE" },
    });
    expect(requestTask.state).toBe("COMPLETED");
    const chase = await prisma.absenceFollowUp.findFirstOrThrow({
      where: { absenceId, purpose: "CHASE_FIT_NOTE" },
    });
    expect(chase.state).toBe("OPEN");
    expect(formatLocalDateIso(chase.dueDate)).toBe("2026-10-13");
    expect(chase.details).toBe(CHASE_FIT_NOTE_DETAILS);
    expect(chase.details).not.toContain("Private note");
    const manualRow = await prisma.absenceFollowUp.findFirstOrThrow({
      where: { absenceId, provenance: "MANUAL" },
    });
    expect(manualRow.state).toBe("OPEN");
    const episode = await prisma.sicknessDetail.findUniqueOrThrow({
      where: { absenceId },
    });
    expect(episode.episodeState).toBe("ONGOING");

    const completed = await completeFollowUp(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      now,
      input: {
        followUpId: chase.id,
        completionNotes: "Phoned and left a message",
        expectedUpdatedAt: chase.updatedAt.toISOString(),
        idempotencyKey: key(),
      },
    });
    expect(completed.ok).toBe(true);
    const stillRequested = await prisma.sicknessFitNote.findUniqueOrThrow({
      where: { id: requested.fitNoteId },
    });
    expect(stillRequested.status).toBe("REQUESTED");
    expect(
      await prisma.absenceFollowUp.count({
        where: { fitNoteId: requested.fitNoteId, purpose: "CHASE_FIT_NOTE" },
      }),
    ).toBe(1);

    const second = await createFitNote(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      now,
      input: {
        absenceId,
        status: "REQUESTED",
        requestedDate: "2026-10-08",
        receivedDate: "",
        note: "",
        idempotencyKey: key(),
      },
    });
    expect(second.ok).toBe(true);
    if (!second.ok || !second.fitNoteId) throw new Error("second fit note");
    const secondChase = await prisma.absenceFollowUp.findFirstOrThrow({
      where: { fitNoteId: second.fitNoteId, purpose: "CHASE_FIT_NOTE" },
    });
    expect(secondChase.state).toBe("OPEN");
    const secondRow = await prisma.sicknessFitNote.findUniqueOrThrow({
      where: { id: second.fitNoteId },
    });

    const received = await updateFitNote(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      now,
      input: {
        fitNoteId: second.fitNoteId,
        status: "RECEIVED",
        requestedDate: "2026-10-08",
        receivedDate: "2026-10-08",
        note: "Private note",
        correctionReason: "Recorded receipt",
        expectedUpdatedAt: secondRow.updatedAt.toISOString(),
        idempotencyKey: key(),
      },
    });
    expect(received.ok).toBe(true);
    const chaseAfter = await prisma.absenceFollowUp.findUniqueOrThrow({
      where: { id: secondChase.id },
    });
    expect(chaseAfter.state).toBe("COMPLETED");
    expect(chaseAfter.completionNotes).toContain("recorded receipt");
    const firstChase = await prisma.absenceFollowUp.findUniqueOrThrow({
      where: { id: chase.id },
    });
    expect(firstChase.state).toBe("COMPLETED");
    expect(firstChase.completionNotes).toBe("Phoned and left a message");
    const afterEpisode = await prisma.sicknessDetail.findUniqueOrThrow({
      where: { absenceId },
    });
    expect(afterEpisode.episodeState).toBe("ONGOING");
  });

  it("backfills only null policies and is safe to replay", async () => {
    const absenceId = await report(tenantB, "2026-08-01");
    await prisma.sicknessDetail.update({
      where: { absenceId },
      data: {
        evidenceRequiredFromDay: null,
        evidenceRequirementDate: null,
        evidencePolicyCapturedAt: null,
        episodeState: "ONGOING",
      },
    });
    const preview = await previewSicknessEvidenceBackfill(
      prisma,
      tenantB.tenant.id,
      now,
    );
    expect(preview.episodes).toBeGreaterThanOrEqual(1);
    expect(preview.records.some((row) => row.absenceId === absenceId)).toBe(true);
    expect(JSON.stringify(preview)).not.toContain("Do not copy");

    const idempotencyKey = key();
    const applied = await applySicknessEvidenceBackfill(prisma, {
      tenantId: tenantB.tenant.id,
      userId: tenantB.user.id,
      idempotencyKey,
      now,
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.replayed).toBe(false);
    const replay = await applySicknessEvidenceBackfill(prisma, {
      tenantId: tenantB.tenant.id,
      userId: tenantB.user.id,
      idempotencyKey,
      now,
    });
    expect(replay.ok && replay.replayed).toBe(true);
    expect(
      await prisma.absenceFollowUp.count({
        where: { absenceId, purpose: "REQUEST_FIT_NOTE" },
      }),
    ).toBe(1);
    const audits = await prisma.tenantSettingsAudit.count({
      where: { tenantId: tenantB.tenant.id, field: "sicknessEvidenceBackfill" },
    });
    expect(audits).toBe(1);
  });

  it("catches a missed threshold on the scheduled run without a page visit", async () => {
    const absenceId = await report(tenantA, "2026-09-20");
    await prisma.sicknessDetail.update({
      where: { absenceId },
      data: { episodeState: "ONGOING" },
    });
    const first = await evaluateTenantSicknessEvidence(
      prisma,
      tenantA.tenant.id,
      now,
    );
    expect(first.failed).toBe(false);
    expect(first.tasksCreated).toBeGreaterThanOrEqual(1);
    const second = await evaluateTenantSicknessEvidence(
      prisma,
      tenantA.tenant.id,
      now,
    );
    expect(second.tasksCreated).toBe(0);
    expect(
      await prisma.absenceFollowUp.count({
        where: { absenceId, purpose: "REQUEST_FIT_NOTE" },
      }),
    ).toBe(1);
    const run = await prisma.sicknessEvidenceEvaluationRun.findFirst({
      where: { tenantId: tenantA.tenant.id },
      orderBy: { startedAt: "desc" },
    });
    expect(run?.status).toBe("SUCCESS");
    expect(JSON.stringify(run)).not.toContain("Jamie");
  });

  it("agrees on the sickness ledger evidence filter", async () => {
    const absenceId = await report(tenantA, "2026-06-01");
    await prisma.sicknessDetail.update({
      where: { absenceId },
      data: { episodeState: "ONGOING" },
    });
    await prisma.$transaction((tx) =>
      evaluateSicknessEvidenceForAbsence(tx, {
        tenantId: tenantA.tenant.id,
        absenceId,
        now,
      }),
    );
    const query = {
      ...defaultLedgerListQuery("sickness"),
      evidenceStatus: "required_unrequested" as const,
    };
    const required = await listAbsencesForLedger(
      prisma,
      tenantA.tenant.id,
      query,
      "2026-10-08",
    );
    expect(required.rows.some((row) => row.id === absenceId)).toBe(true);
    expect(JSON.stringify(required.rows)).not.toContain("Do not copy");

    const requested = await createFitNote(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      now,
      input: {
        absenceId,
        status: "REQUESTED",
        requestedDate: "2026-10-08",
        receivedDate: "",
        note: "",
        idempotencyKey: key(),
      },
    });
    expect(requested.ok).toBe(true);
    const pending = await listAbsencesForLedger(
      prisma,
      tenantA.tenant.id,
      { ...query, evidenceStatus: "requested_pending" },
      "2026-10-08",
    );
    expect(pending.rows.some((row) => row.id === absenceId)).toBe(true);
    const cleared = await listAbsencesForLedger(
      prisma,
      tenantA.tenant.id,
      query,
      "2026-10-08",
    );
    expect(cleared.rows.some((row) => row.id === absenceId)).toBe(false);

    if (!requested.ok || !requested.fitNoteId) throw new Error("fit note");
    await prisma.sicknessFitNote.update({
      where: { id: requested.fitNoteId },
      data: { chaseDueDate: new Date("2026-10-01T00:00:00.000Z") },
    });
    const overdue = await listAbsencesForLedger(
      prisma,
      tenantA.tenant.id,
      { ...query, evidenceStatus: "overdue" },
      "2026-10-08",
    );
    expect(overdue.rows.some((row) => row.id === absenceId)).toBe(true);

    const row = await prisma.sicknessFitNote.findUniqueOrThrow({
      where: { id: requested.fitNoteId },
    });
    const received = await updateFitNote(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      now,
      input: {
        fitNoteId: requested.fitNoteId,
        status: "RECEIVED",
        requestedDate: "2026-10-08",
        receivedDate: "2026-10-08",
        note: "",
        correctionReason: "Recorded receipt",
        expectedUpdatedAt: row.updatedAt.toISOString(),
        idempotencyKey: key(),
      },
    });
    expect(received.ok).toBe(true);
    const receivedRows = await listAbsencesForLedger(
      prisma,
      tenantA.tenant.id,
      { ...query, evidenceStatus: "received" },
      "2026-10-08",
    );
    expect(receivedRows.rows.some((item) => item.id === absenceId)).toBe(true);
  });
});
