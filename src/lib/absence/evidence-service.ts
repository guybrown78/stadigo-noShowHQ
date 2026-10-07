import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import {
  IDEMPOTENCY_TTL_MS,
  SICKNESS_FIT_NOTE_CREATE_IDEMPOTENCY_OPERATION,
  SICKNESS_FIT_NOTE_UPDATE_IDEMPOTENCY_OPERATION,
  SICKNESS_SELF_CERT_UPDATE_IDEMPOTENCY_OPERATION,
  type FitNoteStatus,
} from "@/lib/absence/catalog";
import {
  blankToNull,
  EVIDENCE_ARCHIVED_MESSAGE,
  EVIDENCE_NO_CHANGE_MESSAGE,
  EVIDENCE_STALE_MESSAGE,
  EVIDENCE_UNSUPPORTED_MESSAGE,
  evidenceMutationsAllowed,
  fitNoteChanges,
  fitNoteCreateIsNoChange,
  fitNoteEditIsNoChange,
  selfCertificationChanges,
  selfCertificationIsNoChange,
  type FitNoteSnapshot,
} from "@/lib/absence/evidence";
import {
  createFitNoteSchema,
  saveSelfCertificationSchema,
  updateFitNoteSchema,
  type CreateFitNoteInput,
  type SaveSelfCertificationInput,
  type UpdateFitNoteInput,
} from "@/lib/absence/evidence-schema";
import {
  chaseFieldsForRequested,
  evaluateSicknessEvidenceForAbsence,
  loadSicknessEvidenceCounts,
} from "@/lib/absence/evidence-evaluation";
import { AbsenceAccessError } from "@/lib/absence/errors";
import { diffValues, writeAbsenceHistory } from "@/lib/absence/history";
import { todayIsoInTimeZone } from "@/lib/absence/timezone";
import { flattenFieldErrors, FORM_CHECK_MESSAGE } from "@/lib/form";
import { formatLocalDateIso, parseLocalDate } from "@/lib/events/dates";

export { AbsenceAccessError };

const IDEMPOTENCY_REUSE_MESSAGE =
  "This save was already used with different details. Refresh the page and try again.";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type EvidenceMutationResult =
  | {
      ok: true;
      absenceId: string;
      staffId: string;
      fitNoteId: string | null;
    }
  | {
      ok: false;
      error: string;
      fieldErrors?: Record<string, string[]>;
    };

class EvidenceConflictError extends Error {
  constructor() {
    super("Evidence conflict");
    this.name = "EvidenceConflictError";
  }
}

function payloadHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function timestampsMatch(actual: Date, expected: string): boolean {
  const parsed = Date.parse(expected);
  if (Number.isNaN(parsed)) {
    return false;
  }
  return actual.getTime() === parsed;
}

function invalid(error: Parameters<typeof flattenFieldErrors>[0]): EvidenceMutationResult {
  return {
    ok: false,
    error: FORM_CHECK_MESSAGE,
    fieldErrors: flattenFieldErrors(error),
  };
}

async function nextChaseColumns(
  db: DbClient,
  tenantId: string,
  params: {
    status: FitNoteStatus;
    requestedDateIso: string | null;
    existingChaseAfterDays: number | null;
  },
): Promise<{
  chaseAfterDays: number | null;
  chaseDueDate: Date | null;
  chaseDueIso: string | null;
}> {
  const keepExisting =
    params.existingChaseAfterDays != null &&
    params.requestedDateIso &&
    (params.status === "REQUESTED" || params.status === "RECEIVED");
  if (params.status === "REQUESTED" && params.requestedDateIso) {
    const chaseAfterDays =
      params.existingChaseAfterDays ??
      (await loadSicknessEvidenceCounts(db, tenantId)).chaseAfterDays;
    const fields = chaseFieldsForRequested({
      requestedDateIso: params.requestedDateIso,
      chaseAfterDays,
    });
    return {
      chaseAfterDays,
      chaseDueDate: fields.chaseDueDate,
      chaseDueIso: formatLocalDateIso(fields.chaseDueDate),
    };
  }
  if (keepExisting && params.requestedDateIso && params.existingChaseAfterDays != null) {
    const fields = chaseFieldsForRequested({
      requestedDateIso: params.requestedDateIso,
      chaseAfterDays: params.existingChaseAfterDays,
    });
    return {
      chaseAfterDays: params.existingChaseAfterDays,
      chaseDueDate: fields.chaseDueDate,
      chaseDueIso: formatLocalDateIso(fields.chaseDueDate),
    };
  }
  return { chaseAfterDays: null, chaseDueDate: null, chaseDueIso: null };
}

function formError(message: string): EvidenceMutationResult {
  return { ok: false, error: message, fieldErrors: { form: [message] } };
}

async function lockAbsenceRow(
  db: DbClient,
  tenantId: string,
  absenceId: string,
) {
  await db.$queryRaw`
    SELECT id FROM "Absence"
    WHERE id = ${absenceId} AND "tenantId" = ${tenantId}
    FOR UPDATE
  `;
}

async function lockSelfCertificationRow(
  db: DbClient,
  tenantId: string,
  absenceId: string,
) {
  await db.$queryRaw`
    SELECT "absenceId" FROM "SicknessSelfCertification"
    WHERE "absenceId" = ${absenceId} AND "tenantId" = ${tenantId}
    FOR UPDATE
  `;
}

async function lockFitNoteRow(db: DbClient, tenantId: string, fitNoteId: string) {
  await db.$queryRaw`
    SELECT id FROM "SicknessFitNote"
    WHERE id = ${fitNoteId} AND "tenantId" = ${tenantId}
    FOR UPDATE
  `;
}

type KeyRow = {
  payloadHash: string;
  fitNoteId: string | null;
  absenceId: string | null;
};

async function readKey(
  tx: DbClient,
  params: {
    tenantId: string;
    userId: string;
    operation: string;
    key: string;
    now: Date;
  },
): Promise<KeyRow | null> {
  await tx.absenceIdempotencyKey.deleteMany({
    where: {
      tenantId: params.tenantId,
      actorId: params.userId,
      operation: params.operation,
      expiresAt: { lt: params.now },
    },
  });
  return tx.absenceIdempotencyKey.findUnique({
    where: {
      tenantId_actorId_operation_key: {
        tenantId: params.tenantId,
        actorId: params.userId,
        operation: params.operation,
        key: params.key,
      },
    },
    select: {
      payloadHash: true,
      fitNoteId: true,
      absenceId: true,
    },
  });
}

function replayFromKey(
  key: KeyRow,
  hash: string,
  kind: "self" | "fit",
):
  | { kind: "mismatch" }
  | { kind: "continue" }
  | { kind: "replay"; fitNoteId: string | null; absenceId: string } {
  if (key.payloadHash !== hash) {
    return { kind: "mismatch" };
  }
  if (kind === "self" && key.absenceId) {
    return { kind: "replay", fitNoteId: null, absenceId: key.absenceId };
  }
  if (kind === "fit" && key.fitNoteId && key.absenceId) {
    return {
      kind: "replay",
      fitNoteId: key.fitNoteId,
      absenceId: key.absenceId,
    };
  }
  return { kind: "continue" };
}

async function replayWithStaff(
  tx: DbClient,
  tenantId: string,
  result: Extract<EvidenceMutationResult, { ok: true }>,
): Promise<EvidenceMutationResult> {
  if (result.staffId) {
    return result;
  }
  const absence = await tx.absence.findFirst({
    where: { id: result.absenceId, tenantId },
    select: { staffId: true },
  });
  if (!absence) {
    throw new AbsenceAccessError();
  }
  return { ...result, staffId: absence.staffId };
}

async function claimKey(
  tx: DbClient,
  params: {
    tenantId: string;
    userId: string;
    operation: string;
    key: string;
    payloadHash: string;
    now: Date;
    kind: "self" | "fit";
  },
): Promise<EvidenceMutationResult | "ready"> {
  try {
    await tx.absenceIdempotencyKey.create({
      data: {
        tenantId: params.tenantId,
        actorId: params.userId,
        operation: params.operation,
        key: params.key,
        payloadHash: params.payloadHash,
        expiresAt: new Date(params.now.getTime() + IDEMPOTENCY_TTL_MS),
      },
    });
    return "ready";
  } catch (error) {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== "P2002"
    ) {
      throw error;
    }
    const raced = await tx.absenceIdempotencyKey.findUnique({
      where: {
        tenantId_actorId_operation_key: {
          tenantId: params.tenantId,
          actorId: params.userId,
          operation: params.operation,
          key: params.key,
        },
      },
      select: {
        payloadHash: true,
        fitNoteId: true,
        absenceId: true,
      },
    });
    if (!raced) {
      throw error;
    }
    const replay = replayFromKey(raced, params.payloadHash, params.kind);
    if (replay.kind === "continue") {
      return "ready";
    }
    if (replay.kind === "mismatch") {
      return { ok: false, error: IDEMPOTENCY_REUSE_MESSAGE };
    }
    return replayWithStaff(tx, params.tenantId, {
      ok: true,
      absenceId: replay.absenceId,
      staffId: "",
      fitNoteId: replay.fitNoteId,
    });
  }
}

async function attachKey(
  tx: DbClient,
  params: {
    tenantId: string;
    userId: string;
    operation: string;
    key: string;
    payloadHash: string;
    absenceId: string;
    fitNoteId?: string | null;
  },
) {
  await tx.absenceIdempotencyKey.updateMany({
    where: {
      tenantId: params.tenantId,
      actorId: params.userId,
      operation: params.operation,
      key: params.key,
    },
    data: {
      absenceId: params.absenceId,
      fitNoteId: params.fitNoteId ?? null,
      payloadHash: params.payloadHash,
    },
  });
}

async function loadParent(
  tx: DbClient,
  tenantId: string,
  absenceId: string,
) {
  await lockAbsenceRow(tx, tenantId, absenceId);
  const absence = await tx.absence.findFirst({
    where: { id: absenceId, tenantId },
    select: {
      id: true,
      staffId: true,
      type: true,
      recordStatus: true,
      updatedAt: true,
      sickness: { select: { episodeState: true } },
    },
  });
  if (!absence) {
    throw new AbsenceAccessError();
  }
  return absence;
}

function parentGate(absence: {
  type: string;
  recordStatus: "ACTIVE" | "ARCHIVED";
}): EvidenceMutationResult | null {
  if (absence.type !== "SICKNESS") {
    return { ok: false, error: EVIDENCE_UNSUPPORTED_MESSAGE };
  }
  if (!evidenceMutationsAllowed(absence.recordStatus)) {
    return formError(EVIDENCE_ARCHIVED_MESSAGE);
  }
  return null;
}

async function tenantTodayIso(
  db: PrismaClient,
  tenantId: string,
  now: Date,
): Promise<string> {
  const tenant = await db.tenant.findFirst({
    where: { id: tenantId },
    select: { timezone: true },
  });
  if (!tenant) {
    throw new AbsenceAccessError();
  }
  return todayIsoInTimeZone(tenant.timezone, now);
}

function fitNoteSnapshot(input: {
  status: FitNoteStatus;
  requestedDate: string;
  receivedDate: string;
  note: string;
}): FitNoteSnapshot {
  return {
    status: input.status,
    requestedDate: blankToNull(input.requestedDate),
    receivedDate: blankToNull(input.receivedDate),
    note: blankToNull(input.note),
  };
}

function storedFitNoteSnapshot(row: {
  status: FitNoteStatus;
  requestedDate: Date | null;
  receivedDate: Date | null;
  note: string | null;
}): FitNoteSnapshot {
  return {
    status: row.status,
    requestedDate: row.requestedDate
      ? formatLocalDateIso(row.requestedDate)
      : null,
    receivedDate: row.receivedDate ? formatLocalDateIso(row.receivedDate) : null,
    note: row.note,
  };
}

export async function saveSelfCertification(
  db: PrismaClient,
  params: {
    tenantId: string;
    userId: string;
    input: SaveSelfCertificationInput;
    now?: Date;
  },
): Promise<EvidenceMutationResult> {
  const parsed = saveSelfCertificationSchema().safeParse(params.input);
  if (!parsed.success) {
    return invalid(parsed.error);
  }
  const input = parsed.data;
  const now = params.now ?? new Date();
  const hash = payloadHash({
    absenceId: input.absenceId,
    status: input.status,
    correctionReason: input.expectedUpdatedAt ? input.correctionReason : "",
    expectedUpdatedAt: input.expectedUpdatedAt,
  });

  try {
    return await db.$transaction(async (tx) => {
      const existingKey = await readKey(tx, {
        tenantId: params.tenantId,
        userId: params.userId,
        operation: SICKNESS_SELF_CERT_UPDATE_IDEMPOTENCY_OPERATION,
        key: input.idempotencyKey,
        now,
      });
      if (existingKey) {
        const replay = replayFromKey(existingKey, hash, "self");
        if (replay.kind === "mismatch") {
          return { ok: false, error: IDEMPOTENCY_REUSE_MESSAGE };
        }
        if (replay.kind === "replay") {
          return replayWithStaff(tx, params.tenantId, {
            ok: true,
            absenceId: replay.absenceId,
            staffId: "",
            fitNoteId: null,
          });
        }
      }

      const absence = await loadParent(tx, params.tenantId, input.absenceId);
      const blocked = parentGate(absence);
      if (blocked) {
        return blocked;
      }

      const correcting = Boolean(input.expectedUpdatedAt);
      let current = await tx.sicknessSelfCertification.findFirst({
        where: { absenceId: absence.id, tenantId: params.tenantId },
      });
      if (!correcting) {
        if (current) {
          return formError(EVIDENCE_STALE_MESSAGE);
        }
        if (selfCertificationIsNoChange(null, input.status)) {
          return formError(EVIDENCE_NO_CHANGE_MESSAGE);
        }
      } else {
        if (!current) {
          return formError(EVIDENCE_STALE_MESSAGE);
        }
        await lockSelfCertificationRow(tx, params.tenantId, absence.id);
        current = await tx.sicknessSelfCertification.findFirst({
          where: { absenceId: absence.id, tenantId: params.tenantId },
        });
        if (!current || !timestampsMatch(current.updatedAt, input.expectedUpdatedAt)) {
          return formError(EVIDENCE_STALE_MESSAGE);
        }
        if (selfCertificationIsNoChange(current.status, input.status)) {
          return formError(EVIDENCE_NO_CHANGE_MESSAGE);
        }
      }

      if (!existingKey) {
        const claimed = await claimKey(tx, {
          tenantId: params.tenantId,
          userId: params.userId,
          operation: SICKNESS_SELF_CERT_UPDATE_IDEMPOTENCY_OPERATION,
          key: input.idempotencyKey,
          payloadHash: hash,
          now,
          kind: "self",
        });
        if (claimed !== "ready") {
          return claimed;
        }
      }

      if (!correcting) {
        try {
          await tx.sicknessSelfCertification.create({
            data: {
              absenceId: absence.id,
              tenantId: params.tenantId,
              status: input.status,
              createdById: params.userId,
              updatedById: params.userId,
            },
          });
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
          ) {
            throw new EvidenceConflictError();
          }
          throw error;
        }
        await writeAbsenceHistory(tx, {
          tenantId: params.tenantId,
          absenceId: absence.id,
          action: "EVIDENCE_RECORDED",
          actedById: params.userId,
          changes: selfCertificationChanges(null, input.status),
        });
      } else {
        await tx.sicknessSelfCertification.update({
          where: { absenceId: absence.id },
          data: {
            status: input.status,
            updatedById: params.userId,
          },
        });
        await writeAbsenceHistory(tx, {
          tenantId: params.tenantId,
          absenceId: absence.id,
          action: "EVIDENCE_CORRECTED",
          reason: input.correctionReason,
          actedById: params.userId,
          changes: selfCertificationChanges(current!.status, input.status),
        });
      }

      await attachKey(tx, {
        tenantId: params.tenantId,
        userId: params.userId,
        operation: SICKNESS_SELF_CERT_UPDATE_IDEMPOTENCY_OPERATION,
        key: input.idempotencyKey,
        payloadHash: hash,
        absenceId: absence.id,
      });
      return {
        ok: true as const,
        absenceId: absence.id,
        staffId: absence.staffId,
        fitNoteId: null,
      };
    });
  } catch (error) {
    if (error instanceof EvidenceConflictError) {
      return formError(EVIDENCE_STALE_MESSAGE);
    }
    throw error;
  }
}

export async function createFitNote(
  db: PrismaClient,
  params: {
    tenantId: string;
    userId: string;
    input: CreateFitNoteInput;
    now?: Date;
  },
): Promise<EvidenceMutationResult> {
  const now = params.now ?? new Date();
  const todayIso = await tenantTodayIso(db, params.tenantId, now);
  const parsed = createFitNoteSchema(todayIso).safeParse(params.input);
  if (!parsed.success) {
    return invalid(parsed.error);
  }
  const input = parsed.data;
  const next = fitNoteSnapshot(input);
  const hash = payloadHash({
    absenceId: input.absenceId,
    status: next.status,
    requestedDate: next.requestedDate,
    receivedDate: next.receivedDate,
    note: next.note,
  });

  return db.$transaction(async (tx) => {
    const existingKey = await readKey(tx, {
      tenantId: params.tenantId,
      userId: params.userId,
      operation: SICKNESS_FIT_NOTE_CREATE_IDEMPOTENCY_OPERATION,
      key: input.idempotencyKey,
      now,
    });
    if (existingKey) {
      const replay = replayFromKey(existingKey, hash, "fit");
      if (replay.kind === "mismatch") {
        return { ok: false, error: IDEMPOTENCY_REUSE_MESSAGE };
      }
      if (replay.kind === "replay") {
        return replayWithStaff(tx, params.tenantId, {
          ok: true,
          absenceId: replay.absenceId,
          staffId: "",
          fitNoteId: replay.fitNoteId,
        });
      }
    }

    const absence = await loadParent(tx, params.tenantId, input.absenceId);
    const blocked = parentGate(absence);
    if (blocked) {
      return blocked;
    }
    if (fitNoteCreateIsNoChange(next)) {
      return formError(EVIDENCE_NO_CHANGE_MESSAGE);
    }

    if (!existingKey) {
      const claimed = await claimKey(tx, {
        tenantId: params.tenantId,
        userId: params.userId,
        operation: SICKNESS_FIT_NOTE_CREATE_IDEMPOTENCY_OPERATION,
        key: input.idempotencyKey,
        payloadHash: hash,
        now,
        kind: "fit",
      });
      if (claimed !== "ready") {
        return claimed;
      }
    }

    const chase = await nextChaseColumns(tx, params.tenantId, {
      status: next.status,
      requestedDateIso: next.requestedDate,
      existingChaseAfterDays: null,
    });
    const fitNote = await tx.sicknessFitNote.create({
      data: {
        tenantId: params.tenantId,
        absenceId: absence.id,
        status: next.status,
        requestedDate: next.requestedDate
          ? parseLocalDate(next.requestedDate)
          : null,
        receivedDate: next.receivedDate
          ? parseLocalDate(next.receivedDate)
          : null,
        note: next.note,
        chaseAfterDays: chase.chaseAfterDays,
        chaseDueDate: chase.chaseDueDate,
        createdById: params.userId,
        updatedById: params.userId,
      },
    });
    const recordedChanges = fitNoteChanges({
      fitNoteId: fitNote.id,
      previous: null,
      next,
    });
    if (chase.chaseDueIso) {
      recordedChanges.push({
        field: "fitNoteChaseDueDate",
        previous: null,
        next: chase.chaseDueIso,
      });
    }
    await writeAbsenceHistory(tx, {
      tenantId: params.tenantId,
      absenceId: absence.id,
      action: "EVIDENCE_RECORDED",
      actedById: params.userId,
      changes: recordedChanges,
    });
    await evaluateSicknessEvidenceForAbsence(tx, {
      tenantId: params.tenantId,
      absenceId: absence.id,
      actedById: params.userId,
      now,
    });
    await attachKey(tx, {
      tenantId: params.tenantId,
      userId: params.userId,
      operation: SICKNESS_FIT_NOTE_CREATE_IDEMPOTENCY_OPERATION,
      key: input.idempotencyKey,
      payloadHash: hash,
      absenceId: absence.id,
      fitNoteId: fitNote.id,
    });
    return {
      ok: true as const,
      absenceId: absence.id,
      staffId: absence.staffId,
      fitNoteId: fitNote.id,
    };
  });
}

export async function updateFitNote(
  db: PrismaClient,
  params: {
    tenantId: string;
    userId: string;
    input: UpdateFitNoteInput;
    now?: Date;
  },
): Promise<EvidenceMutationResult> {
  const now = params.now ?? new Date();
  const todayIso = await tenantTodayIso(db, params.tenantId, now);
  const parsed = updateFitNoteSchema(todayIso).safeParse(params.input);
  if (!parsed.success) {
    return invalid(parsed.error);
  }
  const input = parsed.data;
  const next = fitNoteSnapshot(input);
  const hash = payloadHash({
    fitNoteId: input.fitNoteId,
    status: next.status,
    requestedDate: next.requestedDate,
    receivedDate: next.receivedDate,
    note: next.note,
    correctionReason: input.correctionReason,
    expectedUpdatedAt: input.expectedUpdatedAt,
  });

  return db.$transaction(async (tx) => {
    const existingKey = await readKey(tx, {
      tenantId: params.tenantId,
      userId: params.userId,
      operation: SICKNESS_FIT_NOTE_UPDATE_IDEMPOTENCY_OPERATION,
      key: input.idempotencyKey,
      now,
    });
    if (existingKey) {
      const replay = replayFromKey(existingKey, hash, "fit");
      if (replay.kind === "mismatch") {
        return { ok: false, error: IDEMPOTENCY_REUSE_MESSAGE };
      }
      if (replay.kind === "replay") {
        return replayWithStaff(tx, params.tenantId, {
          ok: true,
          absenceId: replay.absenceId,
          staffId: "",
          fitNoteId: replay.fitNoteId,
        });
      }
    }

    const located = await tx.sicknessFitNote.findFirst({
      where: { id: input.fitNoteId, tenantId: params.tenantId },
      select: { absenceId: true },
    });
    if (!located) {
      throw new AbsenceAccessError();
    }
    await lockAbsenceRow(tx, params.tenantId, located.absenceId);
    await lockFitNoteRow(tx, params.tenantId, input.fitNoteId);
    const row = await tx.sicknessFitNote.findFirst({
      where: { id: input.fitNoteId, tenantId: params.tenantId },
      include: {
        absence: {
          select: {
            id: true,
            staffId: true,
            type: true,
            recordStatus: true,
            tenantId: true,
          },
        },
      },
    });
    if (!row || row.absence.tenantId !== params.tenantId) {
      throw new AbsenceAccessError();
    }
    const blocked = parentGate(row.absence);
    if (blocked) {
      return blocked;
    }
    if (!timestampsMatch(row.updatedAt, input.expectedUpdatedAt)) {
      return formError(EVIDENCE_STALE_MESSAGE);
    }
    const previous = storedFitNoteSnapshot(row);
    if (fitNoteEditIsNoChange(previous, next)) {
      return formError(EVIDENCE_NO_CHANGE_MESSAGE);
    }

    if (!existingKey) {
      const claimed = await claimKey(tx, {
        tenantId: params.tenantId,
        userId: params.userId,
        operation: SICKNESS_FIT_NOTE_UPDATE_IDEMPOTENCY_OPERATION,
        key: input.idempotencyKey,
        payloadHash: hash,
        now,
        kind: "fit",
      });
      if (claimed !== "ready") {
        return claimed;
      }
    }

    const chase = await nextChaseColumns(tx, params.tenantId, {
      status: next.status,
      requestedDateIso: next.requestedDate,
      existingChaseAfterDays: row.chaseAfterDays,
    });
    const previousChaseDueIso = row.chaseDueDate
      ? formatLocalDateIso(row.chaseDueDate)
      : null;
    await tx.sicknessFitNote.update({
      where: { id: row.id },
      data: {
        status: next.status,
        requestedDate: next.requestedDate
          ? parseLocalDate(next.requestedDate)
          : null,
        receivedDate: next.receivedDate
          ? parseLocalDate(next.receivedDate)
          : null,
        note: next.note,
        chaseAfterDays: chase.chaseAfterDays,
        chaseDueDate: chase.chaseDueDate,
        updatedById: params.userId,
      },
    });
    const correctedChanges = fitNoteChanges({
      fitNoteId: row.id,
      previous,
      next,
    });
    const chaseDueChange = diffValues(previousChaseDueIso, chase.chaseDueIso);
    if (chaseDueChange) {
      correctedChanges.push({ field: "fitNoteChaseDueDate", ...chaseDueChange });
    }
    await writeAbsenceHistory(tx, {
      tenantId: params.tenantId,
      absenceId: row.absence.id,
      action: "EVIDENCE_CORRECTED",
      reason: input.correctionReason,
      actedById: params.userId,
      changes: correctedChanges,
    });
    await evaluateSicknessEvidenceForAbsence(tx, {
      tenantId: params.tenantId,
      absenceId: row.absence.id,
      actedById: params.userId,
      now,
    });
    await attachKey(tx, {
      tenantId: params.tenantId,
      userId: params.userId,
      operation: SICKNESS_FIT_NOTE_UPDATE_IDEMPOTENCY_OPERATION,
      key: input.idempotencyKey,
      payloadHash: hash,
      absenceId: row.absence.id,
      fitNoteId: row.id,
    });
    return {
      ok: true as const,
      absenceId: row.absence.id,
      staffId: row.absence.staffId,
      fitNoteId: row.id,
    };
  });
}
