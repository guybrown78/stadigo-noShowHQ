import { createHash } from "node:crypto";
import {
  Prisma,
  type AbsenceType,
  type PrismaClient,
} from "@prisma/client";
import {
  FOLLOW_UP_CANCEL_IDEMPOTENCY_OPERATION,
  FOLLOW_UP_COMPLETE_IDEMPOTENCY_OPERATION,
  FOLLOW_UP_CREATE_IDEMPOTENCY_OPERATION,
  FOLLOW_UP_QUEUE_PAGE_SIZE,
  FOLLOW_UP_UPDATE_IDEMPOTENCY_OPERATION,
  IDEMPOTENCY_TTL_MS,
} from "@/lib/absence/catalog";
import { AbsenceAccessError } from "@/lib/absence/errors";
import {
  completionNotesReuseDetails,
  dateOnlyIso,
  followUpContextLines,
  followUpDueState,
  followUpVisibilityFor,
  FOLLOW_UP_VISIBILITY_LABELS,
  followUpEditIsNoChange,
  followUpMutationsAllowed,
  followUpUpdateChanges,
  FOLLOW_UP_ARCHIVED_MESSAGE,
  FOLLOW_UP_NO_CHANGE_MESSAGE,
  FOLLOW_UP_OUTCOME_REUSE_MESSAGE,
  FOLLOW_UP_STALE_MESSAGE,
  FOLLOW_UP_TERMINAL_MESSAGE,
  FOLLOW_UP_UNSUPPORTED_MESSAGE,
  isSupportedFollowUpAbsenceType,
  type FollowUpDueState,
  type FollowUpVisibility,
} from "@/lib/absence/follow-up";
import type {
  CancelFollowUpInput,
  CompleteFollowUpInput,
  CreateFollowUpInput,
  FollowUpQueueQuery,
  UpdateFollowUpInput,
} from "@/lib/absence/follow-up-schema";
import {
  cancelFollowUpSchema,
  completeFollowUpSchema,
  createFollowUpSchema,
  updateFollowUpSchema,
} from "@/lib/absence/follow-up-schema";
import { writeAbsenceHistory } from "@/lib/absence/history";
import { sicknessEpisodeStateLabel } from "@/lib/absence/sickness";
import { flattenFieldErrors, FORM_CHECK_MESSAGE } from "@/lib/form";
import { parseLocalDate } from "@/lib/events/dates";
import { formatStaffName } from "@/lib/staff/display";

export { AbsenceAccessError };

const IDEMPOTENCY_REUSE_MESSAGE =
  "This save was already used with different details. Refresh the page and try again.";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type FollowUpMutationResult =
  | { ok: true; id: string; absenceId: string; staffId: string }
  | {
      ok: false;
      error: string;
      fieldErrors?: Record<string, string[]>;
    };

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

function invalid(error: zSafeError): FollowUpMutationResult {
  return {
    ok: false,
    error: FORM_CHECK_MESSAGE,
    fieldErrors: flattenFieldErrors(error),
  };
}

type zSafeError = Parameters<typeof flattenFieldErrors>[0];

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

async function lockFollowUpRow(
  db: DbClient,
  tenantId: string,
  followUpId: string,
) {
  await db.$queryRaw`
    SELECT id FROM "AbsenceFollowUp"
    WHERE id = ${followUpId} AND "tenantId" = ${tenantId}
    FOR UPDATE
  `;
}

type KeyRow = {
  payloadHash: string;
  followUpId: string | null;
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
      followUpId: true,
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
  | { kind: "replay"; followUpId: string; absenceId: string } {
  if (key.payloadHash !== hash) {
    return { kind: "mismatch" };
  }
  if (key.followUpId && key.absenceId) {
    return {
      kind: "replay",
      followUpId: key.followUpId,
      absenceId: key.absenceId,
    };
  }
  return { kind: "continue" };
}

async function replayWithStaff(
  tx: DbClient,
  tenantId: string,
  result: Extract<FollowUpMutationResult, { ok: true }>,
): Promise<FollowUpMutationResult> {
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
  },
): Promise<FollowUpMutationResult | "ready"> {
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
        followUpId: true,
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
    return replayWithStaff(tx, params.tenantId, {
      ok: true,
      id: replay.followUpId,
      absenceId: replay.absenceId,
      staffId: "",
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
    followUpId: string;
    absenceId: string;
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
      followUpId: params.followUpId,
      absenceId: params.absenceId,
      payloadHash: params.payloadHash,
    },
  });
}

function archivedResult(): FollowUpMutationResult {
  return {
    ok: false,
    error: FOLLOW_UP_ARCHIVED_MESSAGE,
    fieldErrors: { form: [FOLLOW_UP_ARCHIVED_MESSAGE] },
  };
}

export async function createFollowUp(
  db: PrismaClient,
  params: {
    tenantId: string;
    userId: string;
    input: CreateFollowUpInput;
    now?: Date;
  },
): Promise<FollowUpMutationResult> {
  const parsed = createFollowUpSchema.safeParse(params.input);
  if (!parsed.success) {
    return invalid(parsed.error);
  }
  const input = parsed.data;
  const dueDate = parseLocalDate(input.dueDate);
  if (!dueDate) {
    return {
      ok: false,
      error: FORM_CHECK_MESSAGE,
      fieldErrors: { dueDate: ["Enter a valid date"] },
    };
  }
  const now = params.now ?? new Date();
  const hash = payloadHash({
    absenceId: input.absenceId,
    dueDate: input.dueDate,
    details: input.details,
  });

  return db.$transaction(async (tx) => {
    const existingKey = await readKey(tx, {
      tenantId: params.tenantId,
      userId: params.userId,
      operation: FOLLOW_UP_CREATE_IDEMPOTENCY_OPERATION,
      key: input.idempotencyKey,
      now,
    });
    if (existingKey) {
      const replay = replayFromKey(existingKey, hash);
      if (replay.kind === "mismatch") {
        return { ok: false, error: IDEMPOTENCY_REUSE_MESSAGE };
      }
      if (replay.kind === "replay") {
        return replayWithStaff(tx, params.tenantId, {
          ok: true,
          id: replay.followUpId,
          absenceId: replay.absenceId,
          staffId: "",
        });
      }
    }

    await lockAbsenceRow(tx, params.tenantId, input.absenceId);
    const absence = await tx.absence.findFirst({
      where: { id: input.absenceId, tenantId: params.tenantId },
      select: {
        id: true,
        staffId: true,
        type: true,
        recordStatus: true,
      },
    });
    if (!absence) {
      throw new AbsenceAccessError();
    }
    if (!isSupportedFollowUpAbsenceType(absence.type)) {
      return { ok: false, error: FOLLOW_UP_UNSUPPORTED_MESSAGE };
    }
    if (!followUpMutationsAllowed(absence.recordStatus)) {
      return archivedResult();
    }

    if (!existingKey) {
      const claimed = await claimKey(tx, {
        tenantId: params.tenantId,
        userId: params.userId,
        operation: FOLLOW_UP_CREATE_IDEMPOTENCY_OPERATION,
        key: input.idempotencyKey,
        payloadHash: hash,
        now,
      });
      if (claimed !== "ready") {
        return claimed;
      }
    }

    const followUp = await tx.absenceFollowUp.create({
      data: {
        tenantId: params.tenantId,
        absenceId: absence.id,
        state: "OPEN",
        dueDate,
        details: input.details,
        createdById: params.userId,
      },
    });
    await writeAbsenceHistory(tx, {
      tenantId: params.tenantId,
      absenceId: absence.id,
      action: "FOLLOW_UP_CREATED",
      actedById: params.userId,
      changes: [
        { field: "followUpDueDate", previous: null, next: input.dueDate },
        { field: "followUpDetails", previous: null, next: input.details },
        { field: "followUpState", previous: null, next: "OPEN" },
      ],
    });
    await attachKey(tx, {
      tenantId: params.tenantId,
      userId: params.userId,
      operation: FOLLOW_UP_CREATE_IDEMPOTENCY_OPERATION,
      key: input.idempotencyKey,
      payloadHash: hash,
      followUpId: followUp.id,
      absenceId: absence.id,
    });
    return {
      ok: true,
      id: followUp.id,
      absenceId: absence.id,
      staffId: absence.staffId,
    };
  });
}

async function loadOpenFollowUp(
  tx: DbClient,
  tenantId: string,
  followUpId: string,
) {
  await lockFollowUpRow(tx, tenantId, followUpId);
  return tx.absenceFollowUp.findFirst({
    where: { id: followUpId, tenantId },
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
}

export async function updateFollowUp(
  db: PrismaClient,
  params: {
    tenantId: string;
    userId: string;
    input: UpdateFollowUpInput;
    now?: Date;
  },
): Promise<FollowUpMutationResult> {
  const parsed = updateFollowUpSchema.safeParse(params.input);
  if (!parsed.success) {
    return invalid(parsed.error);
  }
  const input = parsed.data;
  const dueDate = parseLocalDate(input.dueDate);
  if (!dueDate) {
    return {
      ok: false,
      error: FORM_CHECK_MESSAGE,
      fieldErrors: { dueDate: ["Enter a valid date"] },
    };
  }
  const now = params.now ?? new Date();
  const hash = payloadHash({
    followUpId: input.followUpId,
    dueDate: input.dueDate,
    details: input.details,
    correctionReason: input.correctionReason,
    expectedUpdatedAt: input.expectedUpdatedAt,
  });
  return db.$transaction(async (tx) => {
    const existingKey = await readKey(tx, {
      tenantId: params.tenantId,
      userId: params.userId,
      operation: FOLLOW_UP_UPDATE_IDEMPOTENCY_OPERATION,
      key: input.idempotencyKey,
      now,
    });
    if (existingKey) {
      const replay = replayFromKey(existingKey, hash);
      if (replay.kind === "mismatch") {
        return { ok: false, error: IDEMPOTENCY_REUSE_MESSAGE };
      }
      if (replay.kind === "replay") {
        return replayWithStaff(tx, params.tenantId, {
          ok: true,
          id: replay.followUpId,
          absenceId: replay.absenceId,
          staffId: "",
        });
      }
    }

    const row = await loadOpenFollowUp(tx, params.tenantId, input.followUpId);
    if (!row || row.absence.tenantId !== params.tenantId) {
      throw new AbsenceAccessError();
    }
    if (!isSupportedFollowUpAbsenceType(row.absence.type)) {
      return { ok: false, error: FOLLOW_UP_UNSUPPORTED_MESSAGE };
    }
    if (!followUpMutationsAllowed(row.absence.recordStatus)) {
      return archivedResult();
    }
    if (row.state !== "OPEN") {
      return terminalOrReplay(tx, params.tenantId, existingKey, hash, row.id);
    }
    if (!timestampsMatch(row.updatedAt, input.expectedUpdatedAt)) {
      return {
        ok: false,
        error: FOLLOW_UP_STALE_MESSAGE,
        fieldErrors: { form: [FOLLOW_UP_STALE_MESSAGE] },
      };
    }
    const previousDue = dateOnlyIso(row.dueDate);
    if (
      followUpEditIsNoChange(
        { dueDateIso: previousDue, details: row.details },
        { dueDateIso: input.dueDate, details: input.details },
      )
    ) {
      return {
        ok: false,
        error: FOLLOW_UP_NO_CHANGE_MESSAGE,
        fieldErrors: { form: [FOLLOW_UP_NO_CHANGE_MESSAGE] },
      };
    }

    if (!existingKey) {
      const claimed = await claimKey(tx, {
        tenantId: params.tenantId,
        userId: params.userId,
        operation: FOLLOW_UP_UPDATE_IDEMPOTENCY_OPERATION,
        key: input.idempotencyKey,
        payloadHash: hash,
        now,
      });
      if (claimed !== "ready") {
        return claimed;
      }
    }

    await tx.absenceFollowUp.update({
      where: { id: row.id },
      data: {
        dueDate,
        details: input.details,
      },
    });
    await writeAbsenceHistory(tx, {
      tenantId: params.tenantId,
      absenceId: row.absenceId,
      action: "FOLLOW_UP_UPDATED",
      reason: input.correctionReason,
      actedById: params.userId,
      changes: followUpUpdateChanges({
        previousDueDate: previousDue,
        nextDueDate: input.dueDate,
        previousDetails: row.details,
        nextDetails: input.details,
      }),
    });
    await attachKey(tx, {
      tenantId: params.tenantId,
      userId: params.userId,
      operation: FOLLOW_UP_UPDATE_IDEMPOTENCY_OPERATION,
      key: input.idempotencyKey,
      payloadHash: hash,
      followUpId: row.id,
      absenceId: row.absenceId,
    });
    return {
      ok: true,
      id: row.id,
      absenceId: row.absenceId,
      staffId: row.absence.staffId,
    };
  });
}

function terminalOrReplay(
  tx: DbClient,
  tenantId: string,
  existingKey: KeyRow | null,
  hash: string,
  followUpId: string,
): Promise<FollowUpMutationResult> {
  if (
    existingKey &&
    existingKey.payloadHash === hash &&
    existingKey.followUpId === followUpId &&
    existingKey.absenceId
  ) {
    return replayWithStaff(tx, tenantId, {
      ok: true,
      id: existingKey.followUpId,
      absenceId: existingKey.absenceId,
      staffId: "",
    });
  }
  return Promise.resolve({
    ok: false,
    error: FOLLOW_UP_TERMINAL_MESSAGE,
    fieldErrors: { form: [FOLLOW_UP_TERMINAL_MESSAGE] },
  });
}

export async function completeFollowUp(
  db: PrismaClient,
  params: {
    tenantId: string;
    userId: string;
    input: CompleteFollowUpInput;
    now?: Date;
  },
): Promise<FollowUpMutationResult> {
  const parsed = completeFollowUpSchema().safeParse(params.input);
  if (!parsed.success) {
    return invalid(parsed.error);
  }
  const input = parsed.data;
  const now = params.now ?? new Date();
  const hash = payloadHash({
    followUpId: input.followUpId,
    completionNotes: input.completionNotes,
    expectedUpdatedAt: input.expectedUpdatedAt,
  });
  return db.$transaction(async (tx) => {
    const existingKey = await readKey(tx, {
      tenantId: params.tenantId,
      userId: params.userId,
      operation: FOLLOW_UP_COMPLETE_IDEMPOTENCY_OPERATION,
      key: input.idempotencyKey,
      now,
    });
    if (existingKey) {
      const replay = replayFromKey(existingKey, hash);
      if (replay.kind === "mismatch") {
        return { ok: false, error: IDEMPOTENCY_REUSE_MESSAGE };
      }
      if (replay.kind === "replay") {
        return replayWithStaff(tx, params.tenantId, {
          ok: true,
          id: replay.followUpId,
          absenceId: replay.absenceId,
          staffId: "",
        });
      }
    }

    const row = await loadOpenFollowUp(tx, params.tenantId, input.followUpId);
    if (!row || row.absence.tenantId !== params.tenantId) {
      throw new AbsenceAccessError();
    }
    if (!isSupportedFollowUpAbsenceType(row.absence.type)) {
      return { ok: false, error: FOLLOW_UP_UNSUPPORTED_MESSAGE };
    }
    if (!followUpMutationsAllowed(row.absence.recordStatus)) {
      return archivedResult();
    }
    if (row.state !== "OPEN") {
      return terminalOrReplay(tx, params.tenantId, existingKey, hash, row.id);
    }
    if (!timestampsMatch(row.updatedAt, input.expectedUpdatedAt)) {
      return {
        ok: false,
        error: FOLLOW_UP_STALE_MESSAGE,
        fieldErrors: { form: [FOLLOW_UP_STALE_MESSAGE] },
      };
    }
    if (completionNotesReuseDetails(row.details, input.completionNotes)) {
      return {
        ok: false,
        error: FOLLOW_UP_OUTCOME_REUSE_MESSAGE,
        fieldErrors: { completionNotes: [FOLLOW_UP_OUTCOME_REUSE_MESSAGE] },
      };
    }

    if (!existingKey) {
      const claimed = await claimKey(tx, {
        tenantId: params.tenantId,
        userId: params.userId,
        operation: FOLLOW_UP_COMPLETE_IDEMPOTENCY_OPERATION,
        key: input.idempotencyKey,
        payloadHash: hash,
        now,
      });
      if (claimed !== "ready") {
        return claimed;
      }
    }

    await tx.absenceFollowUp.update({
      where: { id: row.id },
      data: {
        state: "COMPLETED",
        completionNotes: input.completionNotes,
        completedAt: now,
        completedById: params.userId,
      },
    });
    await writeAbsenceHistory(tx, {
      tenantId: params.tenantId,
      absenceId: row.absenceId,
      action: "FOLLOW_UP_COMPLETED",
      actedById: params.userId,
      changes: [
        {
          field: "followUpCompletionNotes",
          previous: null,
          next: input.completionNotes,
        },
        { field: "followUpState", previous: "OPEN", next: "COMPLETED" },
      ],
    });
    await attachKey(tx, {
      tenantId: params.tenantId,
      userId: params.userId,
      operation: FOLLOW_UP_COMPLETE_IDEMPOTENCY_OPERATION,
      key: input.idempotencyKey,
      payloadHash: hash,
      followUpId: row.id,
      absenceId: row.absenceId,
    });
    return {
      ok: true,
      id: row.id,
      absenceId: row.absenceId,
      staffId: row.absence.staffId,
    };
  });
}

export async function cancelFollowUp(
  db: PrismaClient,
  params: {
    tenantId: string;
    userId: string;
    input: CancelFollowUpInput;
    now?: Date;
  },
): Promise<FollowUpMutationResult> {
  const parsed = cancelFollowUpSchema.safeParse(params.input);
  if (!parsed.success) {
    return invalid(parsed.error);
  }
  const input = parsed.data;
  const now = params.now ?? new Date();
  const hash = payloadHash({
    followUpId: input.followUpId,
    cancellationReason: input.cancellationReason,
    expectedUpdatedAt: input.expectedUpdatedAt,
  });
  return db.$transaction(async (tx) => {
    const existingKey = await readKey(tx, {
      tenantId: params.tenantId,
      userId: params.userId,
      operation: FOLLOW_UP_CANCEL_IDEMPOTENCY_OPERATION,
      key: input.idempotencyKey,
      now,
    });
    if (existingKey) {
      const replay = replayFromKey(existingKey, hash);
      if (replay.kind === "mismatch") {
        return { ok: false, error: IDEMPOTENCY_REUSE_MESSAGE };
      }
      if (replay.kind === "replay") {
        return replayWithStaff(tx, params.tenantId, {
          ok: true,
          id: replay.followUpId,
          absenceId: replay.absenceId,
          staffId: "",
        });
      }
    }

    const row = await loadOpenFollowUp(tx, params.tenantId, input.followUpId);
    if (!row || row.absence.tenantId !== params.tenantId) {
      throw new AbsenceAccessError();
    }
    if (!isSupportedFollowUpAbsenceType(row.absence.type)) {
      return { ok: false, error: FOLLOW_UP_UNSUPPORTED_MESSAGE };
    }
    if (!followUpMutationsAllowed(row.absence.recordStatus)) {
      return archivedResult();
    }
    if (row.state !== "OPEN") {
      return terminalOrReplay(tx, params.tenantId, existingKey, hash, row.id);
    }
    if (!timestampsMatch(row.updatedAt, input.expectedUpdatedAt)) {
      return {
        ok: false,
        error: FOLLOW_UP_STALE_MESSAGE,
        fieldErrors: { form: [FOLLOW_UP_STALE_MESSAGE] },
      };
    }

    if (!existingKey) {
      const claimed = await claimKey(tx, {
        tenantId: params.tenantId,
        userId: params.userId,
        operation: FOLLOW_UP_CANCEL_IDEMPOTENCY_OPERATION,
        key: input.idempotencyKey,
        payloadHash: hash,
        now,
      });
      if (claimed !== "ready") {
        return claimed;
      }
    }

    await tx.absenceFollowUp.update({
      where: { id: row.id },
      data: {
        state: "CANCELLED",
        cancellationReason: input.cancellationReason,
        cancelledAt: now,
        cancelledById: params.userId,
      },
    });
    await writeAbsenceHistory(tx, {
      tenantId: params.tenantId,
      absenceId: row.absenceId,
      action: "FOLLOW_UP_CANCELLED",
      reason: input.cancellationReason,
      actedById: params.userId,
      changes: [
        {
          field: "followUpCancellationReason",
          previous: null,
          next: input.cancellationReason,
        },
        { field: "followUpState", previous: "OPEN", next: "CANCELLED" },
      ],
    });
    await attachKey(tx, {
      tenantId: params.tenantId,
      userId: params.userId,
      operation: FOLLOW_UP_CANCEL_IDEMPOTENCY_OPERATION,
      key: input.idempotencyKey,
      payloadHash: hash,
      followUpId: row.id,
      absenceId: row.absenceId,
    });
    return {
      ok: true,
      id: row.id,
      absenceId: row.absenceId,
      staffId: row.absence.staffId,
    };
  });
}

const openActiveWhere = (tenantId: string) => ({
  tenantId,
  state: "OPEN" as const,
  absence: { tenantId, recordStatus: "ACTIVE" as const },
});

export async function countActionableFollowUps(
  db: PrismaClient,
  tenantId: string,
): Promise<number> {
  const [tasks, visible] = await Promise.all([
    db.absenceFollowUp.count({ where: openActiveWhere(tenantId) }),
    db.absence.count({
      where: {
        tenantId,
        recordStatus: "ACTIVE",
        followUps: { none: { state: "OPEN" } },
        OR: [
          { type: "AWOL" },
          { type: "SICKNESS", sickness: { episodeState: "ONGOING" } },
        ],
      },
    }),
  ]);
  return tasks + visible;
}

export async function countFollowUpsByDueState(
  db: PrismaClient,
  tenantId: string,
  today: Date,
): Promise<{ overdue: number; dueToday: number; upcoming: number }> {
  const [overdue, dueToday, upcoming] = await Promise.all([
    db.absenceFollowUp.count({
      where: { ...openActiveWhere(tenantId), dueDate: { lt: today } },
    }),
    db.absenceFollowUp.count({
      where: { ...openActiveWhere(tenantId), dueDate: today },
    }),
    db.absenceFollowUp.count({
      where: { ...openActiveWhere(tenantId), dueDate: { gt: today } },
    }),
  ]);
  return { overdue, dueToday, upcoming };
}

export type FollowUpQueueRow = {
  id: string;
  absenceId: string;
  kind: "follow-up" | "visibility";
  visibility: FollowUpVisibility | null;
  dueDate: Date | null;
  dueState: FollowUpDueState | null;
  details: string;
  createdAt: Date;
  updatedAt: Date;
  createdByName: string;
  staff: {
    id: string;
    firstName: string;
    lastName: string;
    staffIdNumber: string;
    deletedAt: Date | null;
  };
  absenceType: AbsenceType;
  context: string[];
};

const queueAbsenceSelect = {
  id: true,
  type: true,
  reportedDate: true,
  updatedAt: true,
  staff: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      staffIdNumber: true,
      deletedAt: true,
    },
  },
  cancellation: {
    select: {
      eventNameSnapshot: true,
      eventDateSnapshot: true,
      venueNameSnapshot: true,
    },
  },
  awol: {
    select: {
      eventNameSnapshot: true,
      eventDateSnapshot: true,
      venueNameSnapshot: true,
    },
  },
  sickness: {
    select: {
      firstWorkingDaySick: true,
      episodeState: true,
      staffFirstNameSnapshot: true,
      staffLastNameSnapshot: true,
      staffIdNumberSnapshot: true,
    },
  },
} satisfies Prisma.AbsenceSelect;

type QueueAbsence = Prisma.AbsenceGetPayload<{ select: typeof queueAbsenceSelect }>;

function queueStaff(absence: QueueAbsence) {
  if (absence.type === "SICKNESS" && absence.sickness) {
    return {
      id: absence.staff.id,
      firstName: absence.sickness.staffFirstNameSnapshot,
      lastName: absence.sickness.staffLastNameSnapshot,
      staffIdNumber: absence.sickness.staffIdNumberSnapshot,
      deletedAt: absence.staff.deletedAt,
    };
  }
  return absence.staff;
}

function queueContext(absence: QueueAbsence) {
  return followUpContextLines(
    {
      type: absence.type,
      reportedDate: absence.reportedDate,
      cancellation: absence.cancellation,
      awol: absence.awol,
      sickness: absence.sickness
        ? {
            firstWorkingDaySick: absence.sickness.firstWorkingDaySick,
            episodeState: absence.sickness.episodeState,
          }
        : null,
    },
    sicknessEpisodeStateLabel,
  );
}

function visibilityOf(absence: QueueAbsence): FollowUpVisibility | null {
  return followUpVisibilityFor({
    type: absence.type,
    episodeState: absence.sickness?.episodeState ?? null,
  });
}

export async function listFollowUpQueue(
  db: PrismaClient,
  tenantId: string,
  query: FollowUpQueueQuery,
  today: Date,
): Promise<{
  rows: FollowUpQueueRow[];
  total: number;
  page: number;
  pageCount: number;
}> {
  const todayIso = dateOnlyIso(today);
  const includeVisibility = query.due === "";
  const taskWhere = Prisma.sql`
    f."tenantId" = ${tenantId}
    AND f."state" = 'OPEN'
    AND a."recordStatus" = 'ACTIVE'
    AND a."tenantId" = f."tenantId"
    ${
      query.type
        ? Prisma.sql`AND a.type::text = ${query.type}`
        : Prisma.empty
    }
    ${
      query.due === "overdue"
        ? Prisma.sql`AND f."dueDate" < CAST(${todayIso} AS date)`
        : query.due === "dueToday"
          ? Prisma.sql`AND f."dueDate" = CAST(${todayIso} AS date)`
          : query.due === "upcoming"
            ? Prisma.sql`AND f."dueDate" > CAST(${todayIso} AS date)`
            : Prisma.empty
    }
    ${staffSearchSql(query.q)}
  `;
  const visibilityWhere = Prisma.sql`
    a."tenantId" = ${tenantId}
    AND a."recordStatus" = 'ACTIVE'
    AND (
      a.type::text = 'AWOL'
      OR (a.type::text = 'SICKNESS' AND s."episodeState" = 'ONGOING')
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "AbsenceFollowUp" open_follow_up
      WHERE open_follow_up."absenceId" = a.id
        AND open_follow_up."tenantId" = a."tenantId"
        AND open_follow_up.state = 'OPEN'
    )
    ${
      query.type
        ? Prisma.sql`AND a.type::text = ${query.type}`
        : Prisma.empty
    }
    ${staffSearchSql(query.q)}
  `;
  const taskCountRows = await db.$queryRaw<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM "AbsenceFollowUp" f
    INNER JOIN "Absence" a ON a.id = f."absenceId" AND a."tenantId" = f."tenantId"
    INNER JOIN "Staff" st ON st.id = a."staffId" AND st."tenantId" = a."tenantId"
    LEFT JOIN "SicknessDetail" s ON s."absenceId" = a.id AND s."tenantId" = a."tenantId"
    WHERE ${taskWhere}
  `;
  const visibilityCountRows = includeVisibility
    ? await db.$queryRaw<{ count: number }[]>`
        SELECT COUNT(*)::int AS count
        FROM "Absence" a
        INNER JOIN "Staff" st ON st.id = a."staffId" AND st."tenantId" = a."tenantId"
        LEFT JOIN "SicknessDetail" s ON s."absenceId" = a.id AND s."tenantId" = a."tenantId"
        WHERE ${visibilityWhere}
      `
    : [{ count: 0 }];
  const total =
    Number(taskCountRows[0]?.count ?? 0) +
    Number(visibilityCountRows[0]?.count ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / FOLLOW_UP_QUEUE_PAGE_SIZE));
  if (total === 0 || query.page > pageCount) {
    return { rows: [], total, page: query.page, pageCount };
  }
  const skip = (query.page - 1) * FOLLOW_UP_QUEUE_PAGE_SIZE;
  const visibilitySelect = includeVisibility
    ? Prisma.sql`
        SELECT
          a.id,
          'visibility' AS kind,
          0 AS rank,
          NULL::date AS "dueDate",
          NULL::timestamp AS "createdAt"
        FROM "Absence" a
        INNER JOIN "Staff" st ON st.id = a."staffId" AND st."tenantId" = a."tenantId"
        LEFT JOIN "SicknessDetail" s ON s."absenceId" = a.id AND s."tenantId" = a."tenantId"
        WHERE ${visibilityWhere}
      `
    : Prisma.empty;
  const taskSelect = Prisma.sql`
    SELECT
      f.id,
      'follow-up' AS kind,
      CASE
        WHEN f."dueDate" < CAST(${todayIso} AS date) THEN 1
        WHEN f."dueDate" = CAST(${todayIso} AS date) THEN 2
        ELSE 3
      END AS rank,
      f."dueDate",
      f."createdAt"
    FROM "AbsenceFollowUp" f
    INNER JOIN "Absence" a ON a.id = f."absenceId" AND a."tenantId" = f."tenantId"
    INNER JOIN "Staff" st ON st.id = a."staffId" AND st."tenantId" = a."tenantId"
    LEFT JOIN "SicknessDetail" s ON s."absenceId" = a.id AND s."tenantId" = a."tenantId"
    WHERE ${taskWhere}
  `;
  const ordered = includeVisibility
    ? await db.$queryRaw<{ id: string; kind: string }[]>`
        SELECT combined.id, combined.kind
        FROM (
          ${visibilitySelect}
          UNION ALL
          ${taskSelect}
        ) combined
        ORDER BY
          combined.rank ASC,
          CASE WHEN combined.rank = 1 THEN combined."dueDate" END ASC,
          CASE WHEN combined.rank = 2 THEN combined."createdAt" END ASC,
          CASE WHEN combined.rank = 3 THEN combined."dueDate" END ASC,
          combined.id ASC
        LIMIT ${FOLLOW_UP_QUEUE_PAGE_SIZE}
        OFFSET ${skip}
      `
    : await db.$queryRaw<{ id: string; kind: string }[]>`
        SELECT combined.id, combined.kind
        FROM (${taskSelect}) combined
        ORDER BY
          combined.rank ASC,
          CASE WHEN combined.rank = 1 THEN combined."dueDate" END ASC,
          CASE WHEN combined.rank = 2 THEN combined."createdAt" END ASC,
          CASE WHEN combined.rank = 3 THEN combined."dueDate" END ASC,
          combined.id ASC
        LIMIT ${FOLLOW_UP_QUEUE_PAGE_SIZE}
        OFFSET ${skip}
      `;
  if (ordered.length === 0) {
    return { rows: [], total, page: query.page, pageCount };
  }
  const followUpIds = ordered
    .filter((row) => row.kind === "follow-up")
    .map((row) => row.id);
  const visibilityIds = ordered
    .filter((row) => row.kind === "visibility")
    .map((row) => row.id);
  const [loadedFollowUps, loadedAbsences] = await Promise.all([
    followUpIds.length
      ? db.absenceFollowUp.findMany({
          where: { tenantId, id: { in: followUpIds } },
          select: {
            id: true,
            absenceId: true,
            dueDate: true,
            details: true,
            createdAt: true,
            updatedAt: true,
            createdBy: { select: { firstName: true, lastName: true } },
            absence: { select: queueAbsenceSelect },
          },
        })
      : [],
    visibilityIds.length
      ? db.absence.findMany({
          where: { tenantId, id: { in: visibilityIds } },
          select: queueAbsenceSelect,
        })
      : [],
  ]);
  const followUpsById = new Map(loadedFollowUps.map((row) => [row.id, row]));
  const absencesById = new Map(loadedAbsences.map((row) => [row.id, row]));
  const rows: FollowUpQueueRow[] = [];
  for (const item of ordered) {
    if (item.kind === "visibility") {
      const absence = absencesById.get(item.id);
      if (!absence) continue;
      const visibility = visibilityOf(absence);
      rows.push({
        id: `visibility:${absence.id}`,
        absenceId: absence.id,
        kind: "visibility",
        visibility,
        dueDate: null,
        dueState: null,
        details: visibility ? FOLLOW_UP_VISIBILITY_LABELS[visibility] : "",
        createdAt: absence.updatedAt,
        updatedAt: absence.updatedAt,
        createdByName: "",
        staff: queueStaff(absence),
        absenceType: absence.type,
        context: queueContext(absence),
      });
      continue;
    }
    const row = followUpsById.get(item.id);
    if (!row) continue;
    rows.push({
      id: row.id,
      absenceId: row.absenceId,
      kind: "follow-up",
      visibility: visibilityOf(row.absence),
      dueDate: row.dueDate,
      dueState:
        followUpDueState(dateOnlyIso(row.dueDate), todayIso, "OPEN") ??
        "upcoming",
      details: row.details,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      createdByName: row.createdBy
        ? formatStaffName(row.createdBy)
        : "NoShowHQ",
      staff: queueStaff(row.absence),
      absenceType: row.absence.type,
      context: queueContext(row.absence),
    });
  }
  return { rows, total, page: query.page, pageCount };
}

function staffSearchSql(search: string) {
  const trimmed = search.trim();
  if (!trimmed) {
    return Prisma.empty;
  }
  const pattern = `%${trimmed}%`;
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  const fullName =
    tokens.length >= 2
      ? Prisma.sql`
          OR (
            st."firstName" ILIKE ${"%" + tokens[0] + "%"}
            AND st."lastName" ILIKE ${"%" + tokens.slice(1).join(" ") + "%"}
          )
          OR (
            s."staffFirstNameSnapshot" ILIKE ${"%" + tokens[0] + "%"}
            AND s."staffLastNameSnapshot" ILIKE ${"%" + tokens.slice(1).join(" ") + "%"}
          )
        `
      : Prisma.empty;
  return Prisma.sql`
    AND (
      st."firstName" ILIKE ${pattern}
      OR st."lastName" ILIKE ${pattern}
      OR st."staffIdNumber" ILIKE ${pattern}
      OR st."staffIdNormalized" ILIKE ${"%" + trimmed.toLowerCase() + "%"}
      OR s."staffFirstNameSnapshot" ILIKE ${pattern}
      OR s."staffLastNameSnapshot" ILIKE ${pattern}
      OR s."staffIdNumberSnapshot" ILIKE ${pattern}
      ${fullName}
    )
  `;
}
