import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import {
  IDEMPOTENCY_TTL_MS,
  SICKNESS_RETURN_TO_WORK_UPDATE_IDEMPOTENCY_OPERATION,
  type ReturnToWorkStatus,
} from "@/lib/absence/catalog";
import { AbsenceAccessError } from "@/lib/absence/errors";
import { writeAbsenceHistory } from "@/lib/absence/history";
import {
  RETURN_TO_WORK_ARCHIVED_MESSAGE,
  RETURN_TO_WORK_NO_CHANGE_MESSAGE,
  RETURN_TO_WORK_STALE_MESSAGE,
  RETURN_TO_WORK_UNSUPPORTED_MESSAGE,
  returnToWorkChanges,
  returnToWorkIsNoChange,
  returnToWorkMutationsAllowed,
  returnToWorkSnapshot,
  type ReturnToWorkSnapshot,
} from "@/lib/absence/return-to-work";
import {
  saveReturnToWorkSchema,
  type SaveReturnToWorkInput,
} from "@/lib/absence/return-to-work-schema";
import { todayIsoInTimeZone } from "@/lib/absence/timezone";
import { flattenFieldErrors, FORM_CHECK_MESSAGE } from "@/lib/form";
import { formatLocalDateIso, parseLocalDate } from "@/lib/events/dates";

export { AbsenceAccessError };

const IDEMPOTENCY_REUSE_MESSAGE =
  "This save was already used with different details. Refresh the page and try again.";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type ReturnToWorkMutationResult =
  | { ok: true; absenceId: string; staffId: string }
  | {
      ok: false;
      error: string;
      fieldErrors?: Record<string, string[]>;
    };

class ReturnToWorkConflictError extends Error {
  constructor() {
    super("Return to work conflict");
    this.name = "ReturnToWorkConflictError";
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

function invalid(
  error: Parameters<typeof flattenFieldErrors>[0],
): ReturnToWorkMutationResult {
  return {
    ok: false,
    error: FORM_CHECK_MESSAGE,
    fieldErrors: flattenFieldErrors(error),
  };
}

function formError(message: string): ReturnToWorkMutationResult {
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

async function lockReturnToWorkRow(
  db: DbClient,
  tenantId: string,
  absenceId: string,
) {
  await db.$queryRaw`
    SELECT "absenceId" FROM "SicknessReturnToWork"
    WHERE "absenceId" = ${absenceId} AND "tenantId" = ${tenantId}
    FOR UPDATE
  `;
}

type KeyRow = {
  payloadHash: string;
  absenceId: string | null;
};

async function readKey(
  tx: DbClient,
  params: {
    tenantId: string;
    userId: string;
    key: string;
    now: Date;
  },
): Promise<KeyRow | null> {
  await tx.absenceIdempotencyKey.deleteMany({
    where: {
      tenantId: params.tenantId,
      actorId: params.userId,
      operation: SICKNESS_RETURN_TO_WORK_UPDATE_IDEMPOTENCY_OPERATION,
      expiresAt: { lt: params.now },
    },
  });
  return tx.absenceIdempotencyKey.findUnique({
    where: {
      tenantId_actorId_operation_key: {
        tenantId: params.tenantId,
        actorId: params.userId,
        operation: SICKNESS_RETURN_TO_WORK_UPDATE_IDEMPOTENCY_OPERATION,
        key: params.key,
      },
    },
    select: {
      payloadHash: true,
      absenceId: true,
    },
  });
}

function replayFromKey(
  key: KeyRow,
  hash: string,
):
  | { kind: "mismatch" }
  | { kind: "continue" }
  | { kind: "replay"; absenceId: string } {
  if (key.payloadHash !== hash) {
    return { kind: "mismatch" };
  }
  if (key.absenceId) {
    return { kind: "replay", absenceId: key.absenceId };
  }
  return { kind: "continue" };
}

async function replayWithStaff(
  tx: DbClient,
  tenantId: string,
  absenceId: string,
): Promise<ReturnToWorkMutationResult> {
  const absence = await tx.absence.findFirst({
    where: { id: absenceId, tenantId },
    select: { staffId: true },
  });
  if (!absence) {
    throw new AbsenceAccessError();
  }
  return { ok: true, absenceId, staffId: absence.staffId };
}

async function claimKey(
  tx: DbClient,
  params: {
    tenantId: string;
    userId: string;
    key: string;
    payloadHash: string;
    now: Date;
  },
): Promise<ReturnToWorkMutationResult | "ready"> {
  try {
    await tx.absenceIdempotencyKey.create({
      data: {
        tenantId: params.tenantId,
        actorId: params.userId,
        operation: SICKNESS_RETURN_TO_WORK_UPDATE_IDEMPOTENCY_OPERATION,
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
          operation: SICKNESS_RETURN_TO_WORK_UPDATE_IDEMPOTENCY_OPERATION,
          key: params.key,
        },
      },
      select: {
        payloadHash: true,
        absenceId: true,
      },
    });
    if (!raced) {
      throw error;
    }
    const replay = replayFromKey(raced, params.payloadHash);
    if (replay.kind === "continue") {
      return "ready";
    }
    if (replay.kind === "mismatch") {
      return { ok: false, error: IDEMPOTENCY_REUSE_MESSAGE };
    }
    return replayWithStaff(tx, params.tenantId, replay.absenceId);
  }
}

async function attachKey(
  tx: DbClient,
  params: {
    tenantId: string;
    userId: string;
    key: string;
    payloadHash: string;
    absenceId: string;
  },
) {
  await tx.absenceIdempotencyKey.updateMany({
    where: {
      tenantId: params.tenantId,
      actorId: params.userId,
      operation: SICKNESS_RETURN_TO_WORK_UPDATE_IDEMPOTENCY_OPERATION,
      key: params.key,
    },
    data: {
      absenceId: params.absenceId,
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
}): ReturnToWorkMutationResult | null {
  if (absence.type !== "SICKNESS") {
    return { ok: false, error: RETURN_TO_WORK_UNSUPPORTED_MESSAGE };
  }
  if (!returnToWorkMutationsAllowed(absence.recordStatus)) {
    return formError(RETURN_TO_WORK_ARCHIVED_MESSAGE);
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

function storedSnapshot(row: {
  status: ReturnToWorkStatus;
  completedOn: Date | null;
  note: string | null;
}): ReturnToWorkSnapshot {
  return {
    status: row.status,
    completedOn: row.completedOn ? formatLocalDateIso(row.completedOn) : null,
    note: row.note,
  };
}

export async function saveReturnToWork(
  db: PrismaClient,
  params: {
    tenantId: string;
    userId: string;
    input: SaveReturnToWorkInput;
    now?: Date;
  },
): Promise<ReturnToWorkMutationResult> {
  const now = params.now ?? new Date();
  const todayIso = await tenantTodayIso(db, params.tenantId, now);
  const parsed = saveReturnToWorkSchema(todayIso).safeParse(params.input);
  if (!parsed.success) {
    return invalid(parsed.error);
  }
  const input = parsed.data;
  const next = returnToWorkSnapshot(input);
  const hash = payloadHash({
    absenceId: input.absenceId,
    status: next.status,
    completedOn: next.completedOn,
    note: next.note,
    correctionReason: input.expectedUpdatedAt ? input.correctionReason : "",
    expectedUpdatedAt: input.expectedUpdatedAt,
  });

  try {
    return await db.$transaction(async (tx) => {
      const existingKey = await readKey(tx, {
        tenantId: params.tenantId,
        userId: params.userId,
        key: input.idempotencyKey,
        now,
      });
      if (existingKey) {
        const replay = replayFromKey(existingKey, hash);
        if (replay.kind === "mismatch") {
          return { ok: false, error: IDEMPOTENCY_REUSE_MESSAGE };
        }
        if (replay.kind === "replay") {
          return replayWithStaff(tx, params.tenantId, replay.absenceId);
        }
      }

      const absence = await loadParent(tx, params.tenantId, input.absenceId);
      const blocked = parentGate(absence);
      if (blocked) {
        return blocked;
      }

      const correcting = Boolean(input.expectedUpdatedAt);
      let current = await tx.sicknessReturnToWork.findFirst({
        where: { absenceId: absence.id, tenantId: params.tenantId },
      });
      const currentSnapshot = current ? storedSnapshot(current) : null;
      if (!correcting) {
        if (current) {
          return formError(RETURN_TO_WORK_STALE_MESSAGE);
        }
        if (returnToWorkIsNoChange(null, next)) {
          return formError(RETURN_TO_WORK_NO_CHANGE_MESSAGE);
        }
      } else {
        if (!current) {
          return formError(RETURN_TO_WORK_STALE_MESSAGE);
        }
        await lockReturnToWorkRow(tx, params.tenantId, absence.id);
        current = await tx.sicknessReturnToWork.findFirst({
          where: { absenceId: absence.id, tenantId: params.tenantId },
        });
        if (
          !current ||
          !timestampsMatch(current.updatedAt, input.expectedUpdatedAt)
        ) {
          return formError(RETURN_TO_WORK_STALE_MESSAGE);
        }
        if (returnToWorkIsNoChange(storedSnapshot(current), next)) {
          return formError(RETURN_TO_WORK_NO_CHANGE_MESSAGE);
        }
      }

      if (!existingKey) {
        const claimed = await claimKey(tx, {
          tenantId: params.tenantId,
          userId: params.userId,
          key: input.idempotencyKey,
          payloadHash: hash,
          now,
        });
        if (claimed !== "ready") {
          return claimed;
        }
      }

      const completedOn = next.completedOn
        ? parseLocalDate(next.completedOn)
        : null;
      if (!correcting) {
        try {
          await tx.sicknessReturnToWork.create({
            data: {
              absenceId: absence.id,
              tenantId: params.tenantId,
              status: next.status,
              completedOn,
              note: next.note,
              createdById: params.userId,
              updatedById: params.userId,
            },
          });
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
          ) {
            throw new ReturnToWorkConflictError();
          }
          throw error;
        }
        await writeAbsenceHistory(tx, {
          tenantId: params.tenantId,
          absenceId: absence.id,
          action: "RETURN_TO_WORK_RECORDED",
          actedById: params.userId,
          changes: returnToWorkChanges(null, next),
        });
      } else {
        await tx.sicknessReturnToWork.update({
          where: { absenceId: absence.id },
          data: {
            status: next.status,
            completedOn,
            note: next.note,
            updatedById: params.userId,
          },
        });
        await writeAbsenceHistory(tx, {
          tenantId: params.tenantId,
          absenceId: absence.id,
          action: "RETURN_TO_WORK_CORRECTED",
          reason: input.correctionReason,
          actedById: params.userId,
          changes: returnToWorkChanges(currentSnapshot, next),
        });
      }

      await attachKey(tx, {
        tenantId: params.tenantId,
        userId: params.userId,
        key: input.idempotencyKey,
        payloadHash: hash,
        absenceId: absence.id,
      });
      return {
        ok: true as const,
        absenceId: absence.id,
        staffId: absence.staffId,
      };
    });
  } catch (error) {
    if (error instanceof ReturnToWorkConflictError) {
      return formError(RETURN_TO_WORK_STALE_MESSAGE);
    }
    throw error;
  }
}
