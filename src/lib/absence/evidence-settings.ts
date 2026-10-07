import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import {
  IDEMPOTENCY_TTL_MS,
  SICKNESS_EVIDENCE_BACKFILL_IDEMPOTENCY_OPERATION,
} from "@/lib/absence/catalog";
import {
  chaseFieldsForRequested,
  episodePolicyFields,
  evaluateSicknessEvidenceForAbsence,
} from "@/lib/absence/evidence-evaluation";
import {
  DEFAULT_FIT_NOTE_CHASE_AFTER_DAYS,
  DEFAULT_FIT_NOTE_REQUIRED_FROM_DAY,
  parseEvidenceDayCount,
  sicknessDayOneIso,
} from "@/lib/absence/evidence-policy";
import { writeAbsenceHistory } from "@/lib/absence/history";
import { getTenantTimezone } from "@/lib/absence/queries";
import { todayIsoInTimeZone } from "@/lib/absence/timezone";
import { formatLocalDateIso } from "@/lib/events/dates";

type DbClient = PrismaClient | Prisma.TransactionClient;

const IDEMPOTENCY_REUSE_MESSAGE =
  "This save was already used with different details. Refresh the page and try again.";

export type SicknessEvidenceSettings = {
  requiredFromDay: number;
  chaseAfterDays: number;
  updatedAt: Date | null;
  updatedBy: { firstName: string; lastName: string } | null;
};

export async function getSicknessEvidenceSettings(
  db: DbClient,
  tenantId: string,
): Promise<SicknessEvidenceSettings> {
  const tenant = await db.tenant.findFirst({
    where: { id: tenantId },
    select: {
      fitNoteRequiredFromDay: true,
      fitNoteChaseAfterDays: true,
      sicknessEvidenceUpdatedAt: true,
      sicknessEvidenceUpdatedBy: {
        select: { firstName: true, lastName: true },
      },
    },
  });
  return {
    requiredFromDay:
      tenant && tenant.fitNoteRequiredFromDay > 0
        ? tenant.fitNoteRequiredFromDay
        : DEFAULT_FIT_NOTE_REQUIRED_FROM_DAY,
    chaseAfterDays:
      tenant && tenant.fitNoteChaseAfterDays > 0
        ? tenant.fitNoteChaseAfterDays
        : DEFAULT_FIT_NOTE_CHASE_AFTER_DAYS,
    updatedAt: tenant?.sicknessEvidenceUpdatedAt ?? null,
    updatedBy: tenant?.sicknessEvidenceUpdatedBy ?? null,
  };
}

export async function updateSicknessEvidenceSettings(
  db: PrismaClient,
  params: {
    tenantId: string;
    userId: string;
    requiredFromDay: number;
    chaseAfterDays: number;
  },
): Promise<
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> }
> {
  const required = parseEvidenceDayCount(String(params.requiredFromDay));
  const chase = parseEvidenceDayCount(String(params.chaseAfterDays));
  if (!required.ok || !chase.ok) {
    return {
      ok: false,
      error: "Check the form and try again.",
      fieldErrors: {
        ...(required.ok
          ? {}
          : { fitNoteRequiredFromDay: [required.message] }),
        ...(chase.ok ? {} : { fitNoteChaseAfterDays: [chase.message] }),
      },
    };
  }

  return db.$transaction(async (tx) => {
    const current = await tx.tenant.findFirst({
      where: { id: params.tenantId },
      select: {
        fitNoteRequiredFromDay: true,
        fitNoteChaseAfterDays: true,
      },
    });
    if (!current) {
      return { ok: false as const, error: "Settings could not be saved." };
    }
    const requiredChanged = current.fitNoteRequiredFromDay !== required.value;
    const chaseChanged = current.fitNoteChaseAfterDays !== chase.value;
    if (!requiredChanged && !chaseChanged) {
      return { ok: true as const };
    }
    await tx.tenant.update({
      where: { id: params.tenantId },
      data: {
        fitNoteRequiredFromDay: required.value,
        fitNoteChaseAfterDays: chase.value,
        sicknessEvidenceUpdatedAt: new Date(),
        sicknessEvidenceUpdatedById: params.userId,
      },
    });
    const audits = [
      requiredChanged
        ? {
            field: "fitNoteRequiredFromDay",
            previous: String(current.fitNoteRequiredFromDay),
            next: String(required.value),
          }
        : null,
      chaseChanged
        ? {
            field: "fitNoteChaseAfterDays",
            previous: String(current.fitNoteChaseAfterDays),
            next: String(chase.value),
          }
        : null,
    ].filter((row): row is { field: string; previous: string; next: string } =>
      Boolean(row),
    );
    await tx.tenantSettingsAudit.createMany({
      data: audits.map((audit) => ({
        tenantId: params.tenantId,
        actorId: params.userId,
        field: audit.field,
        previous: audit.previous,
        next: audit.next,
      })),
    });
    return { ok: true as const };
  });
}

export type BackfillPreviewRecord = {
  absenceId: string;
  staffFirstName: string;
  staffLastName: string;
  episodeState: string;
  dayOne: string;
  requirementDate: string;
  wouldCreateRequest: boolean;
  outstandingRequests: number;
};

export type BackfillPreview = {
  episodes: number;
  requirementEligible: number;
  requestTasks: number;
  chases: number;
  records: BackfillPreviewRecord[];
  truncated: boolean;
};

export async function previewSicknessEvidenceBackfill(
  db: DbClient,
  tenantId: string,
  now: Date = new Date(),
): Promise<BackfillPreview> {
  const settings = await getSicknessEvidenceSettings(db, tenantId);
  const timeZone = await getTenantTimezone(db, tenantId);
  const todayIso = todayIsoInTimeZone(timeZone, now);
  const rows = await db.sicknessDetail.findMany({
    where: {
      tenantId,
      evidenceRequiredFromDay: null,
      absence: { type: "SICKNESS", recordStatus: "ACTIVE" },
    },
    select: {
      absenceId: true,
      episodeState: true,
      firstWorkingDaySick: true,
      sicknessStartedDate: true,
      sicknessEndedDate: true,
      staffFirstNameSnapshot: true,
      staffLastNameSnapshot: true,
      absence: {
        select: {
          fitNotes: {
            select: { status: true, id: true },
          },
          followUps: {
            where: { provenance: "SYSTEM" },
            select: { purpose: true, fitNoteId: true },
          },
        },
      },
    },
    orderBy: { firstWorkingDaySick: "asc" },
  });

  const records: BackfillPreviewRecord[] = [];
  let requirementEligible = 0;
  let requestTasks = 0;
  let chases = 0;
  for (const row of rows) {
    const dayOne = sicknessDayOneIso({
      sicknessStartedDateIso: row.sicknessStartedDate
        ? formatLocalDateIso(row.sicknessStartedDate)
        : null,
      firstWorkingDaySickIso: formatLocalDateIso(row.firstWorkingDaySick),
    });
    const policy = episodePolicyFields({
      requiredFromDay: settings.requiredFromDay,
      sicknessStartedDateIso: row.sicknessStartedDate
        ? formatLocalDateIso(row.sicknessStartedDate)
        : null,
      firstWorkingDaySickIso: formatLocalDateIso(row.firstWorkingDaySick),
      now,
    });
    const requirementDate = formatLocalDateIso(policy.evidenceRequirementDate);
    const endedIso = row.sicknessEndedDate
      ? formatLocalDateIso(row.sicknessEndedDate)
      : null;
    const reached =
      row.episodeState === "ENDED"
        ? Boolean(endedIso && endedIso >= requirementDate)
        : row.episodeState === "ONGOING" && todayIso >= requirementDate;
    const hasReceived = row.absence.fitNotes.some(
      (note) => note.status === "RECEIVED",
    );
    const requested = row.absence.fitNotes.filter(
      (note) => note.status === "REQUESTED",
    );
    const hasRequestTask = row.absence.followUps.some(
      (task) => task.purpose === "REQUEST_FIT_NOTE",
    );
    const wouldCreateRequest =
      reached && !hasReceived && requested.length === 0 && !hasRequestTask;
    const outstandingRequests = requested.filter(
      (note) =>
        !row.absence.followUps.some(
          (task) =>
            task.purpose === "CHASE_FIT_NOTE" && task.fitNoteId === note.id,
        ),
    ).length;
    if (reached) requirementEligible += 1;
    if (wouldCreateRequest) requestTasks += 1;
    chases += outstandingRequests;
    records.push({
      absenceId: row.absenceId,
      staffFirstName: row.staffFirstNameSnapshot,
      staffLastName: row.staffLastNameSnapshot,
      episodeState: row.episodeState,
      dayOne,
      requirementDate,
      wouldCreateRequest,
      outstandingRequests,
    });
  }

  return {
    episodes: rows.length,
    requirementEligible,
    requestTasks,
    chases,
    records: records.slice(0, 50),
    truncated: records.length > 50,
  };
}

export async function applySicknessEvidenceBackfill(
  db: PrismaClient,
  params: {
    tenantId: string;
    userId: string;
    idempotencyKey: string;
    now?: Date;
  },
): Promise<
  | {
      ok: true;
      replayed: boolean;
      episodes: number;
      tasksCreated: number;
    }
  | { ok: false; error: string }
> {
  const now = params.now ?? new Date();
  const payloadHash = createHash("sha256")
    .update(
      JSON.stringify({
        tenantId: params.tenantId,
        operation: SICKNESS_EVIDENCE_BACKFILL_IDEMPOTENCY_OPERATION,
      }),
    )
    .digest("hex");

  return db.$transaction(
    async (tx) => {
      await tx.absenceIdempotencyKey.deleteMany({
        where: {
          tenantId: params.tenantId,
          actorId: params.userId,
          operation: SICKNESS_EVIDENCE_BACKFILL_IDEMPOTENCY_OPERATION,
          expiresAt: { lt: now },
        },
      });
      const existingKey = await tx.absenceIdempotencyKey.findUnique({
        where: {
          tenantId_actorId_operation_key: {
            tenantId: params.tenantId,
            actorId: params.userId,
            operation: SICKNESS_EVIDENCE_BACKFILL_IDEMPOTENCY_OPERATION,
            key: params.idempotencyKey,
          },
        },
      });
      if (existingKey) {
        if (existingKey.payloadHash !== payloadHash) {
          return { ok: false as const, error: IDEMPOTENCY_REUSE_MESSAGE };
        }
        return {
          ok: true as const,
          replayed: true,
          episodes: 0,
          tasksCreated: 0,
        };
      }
      await tx.absenceIdempotencyKey.create({
        data: {
          tenantId: params.tenantId,
          actorId: params.userId,
          operation: SICKNESS_EVIDENCE_BACKFILL_IDEMPOTENCY_OPERATION,
          key: params.idempotencyKey,
          payloadHash,
          expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
        },
      });

      const settings = await getSicknessEvidenceSettings(tx, params.tenantId);
      const rows = await tx.sicknessDetail.findMany({
        where: {
          tenantId: params.tenantId,
          evidenceRequiredFromDay: null,
          absence: { type: "SICKNESS", recordStatus: "ACTIVE" },
        },
        select: {
          absenceId: true,
          firstWorkingDaySick: true,
          sicknessStartedDate: true,
          absence: {
            select: {
              fitNotes: {
                select: {
                  id: true,
                  status: true,
                  requestedDate: true,
                  chaseAfterDays: true,
                },
              },
            },
          },
        },
        orderBy: { absenceId: "asc" },
      });

      let tasksCreated = 0;
      for (const row of rows) {
        const startedIso = row.sicknessStartedDate
          ? formatLocalDateIso(row.sicknessStartedDate)
          : null;
        const firstIso = formatLocalDateIso(row.firstWorkingDaySick);
        const policy = episodePolicyFields({
          requiredFromDay: settings.requiredFromDay,
          sicknessStartedDateIso: startedIso,
          firstWorkingDaySickIso: firstIso,
          now,
        });
        await tx.sicknessDetail.update({
          where: { absenceId: row.absenceId },
          data: policy,
        });
        for (const note of row.absence.fitNotes) {
          if (note.status !== "REQUESTED" || !note.requestedDate || note.chaseAfterDays != null) {
            continue;
          }
          const chase = chaseFieldsForRequested({
            requestedDateIso: formatLocalDateIso(note.requestedDate),
            chaseAfterDays: settings.chaseAfterDays,
          });
          await tx.sicknessFitNote.update({
            where: { id: note.id },
            data: chase,
          });
        }
        await writeAbsenceHistory(tx, {
          tenantId: params.tenantId,
          absenceId: row.absenceId,
          action: "CORRECTED",
          actedById: params.userId,
          reason: "Applied current fit note settings",
          changes: [
            {
              field: "evidenceRequiredFromDay",
              previous: null,
              next: String(policy.evidenceRequiredFromDay),
            },
            {
              field: "evidenceRequirementDate",
              previous: null,
              next: formatLocalDateIso(policy.evidenceRequirementDate),
            },
          ],
        });
        const counts = await evaluateSicknessEvidenceForAbsence(tx, {
          tenantId: params.tenantId,
          absenceId: row.absenceId,
          actedById: params.userId,
          now,
        });
        tasksCreated += counts.tasksCreated;
      }

      await tx.tenantSettingsAudit.create({
        data: {
          tenantId: params.tenantId,
          actorId: params.userId,
          field: "sicknessEvidenceBackfill",
          previous: null,
          next: `episodes=${rows.length};tasksCreated=${tasksCreated}`,
        },
      });

      return {
        ok: true as const,
        replayed: false,
        episodes: rows.length,
        tasksCreated,
      };
    },
    { timeout: 30_000 },
  );
}

export async function latestSicknessEvidenceEvaluationRun(
  db: DbClient,
  tenantId: string,
) {
  return db.sicknessEvidenceEvaluationRun.findFirst({
    where: { tenantId },
    orderBy: { startedAt: "desc" },
    select: {
      startedAt: true,
      finishedAt: true,
      status: true,
      episodesScanned: true,
      tasksCreated: true,
      tasksCompleted: true,
      tasksCancelled: true,
    },
  });
}
