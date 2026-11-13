import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import {
  IDEMPOTENCY_TTL_MS,
  SICKNESS_MISSED_SHIFT_ADD_IDEMPOTENCY_OPERATION,
  SICKNESS_MISSED_SHIFT_REMOVE_IDEMPOTENCY_OPERATION,
} from "@/lib/absence/catalog";
import { AbsenceAccessError } from "@/lib/absence/errors";
import { writeAbsenceHistory } from "@/lib/absence/history";
import {
  MISSED_SHIFT_ABSENCE_CONFLICT_MESSAGE,
  MISSED_SHIFT_ARCHIVED_MESSAGE,
  MISSED_SHIFT_DUPLICATE_MESSAGE,
  MISSED_SHIFT_EVENT_MESSAGE,
  MISSED_SHIFT_NOT_FOUND_MESSAGE,
  MISSED_SHIFT_OTHER_SICKNESS_MESSAGE,
  MISSED_SHIFT_STAFF_CONFLICT_MESSAGE,
  MISSED_SHIFT_UNSUPPORTED_MESSAGE,
  missedShiftHistoryValue,
} from "@/lib/absence/missed-shift";
import {
  addMissedShiftSchema,
  removeMissedShiftSchema,
  type AddMissedShiftInput,
  type RemoveMissedShiftInput,
} from "@/lib/absence/missed-shift-schema";
import {
  findActiveCancellationOrAwol,
  findActiveMissedShift,
} from "@/lib/absence/queries";
import { flattenFieldErrors, FORM_CHECK_MESSAGE } from "@/lib/form";

const IDEMPOTENCY_REUSE_MESSAGE =
  "This save was already used with different details. Refresh the page and try again.";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type MissedShiftMutationResult =
  | { ok: true; absenceId: string; staffId: string; shiftId: string | null }
  | MissedShiftFailure;

type MissedShiftFailure = {
  ok: false;
  error: string;
  fieldErrors?: Record<string, string[]>;
  existingAbsenceId?: string;
};

function payloadHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function invalid(
  error: Parameters<typeof flattenFieldErrors>[0],
): MissedShiftMutationResult {
  return {
    ok: false,
    error: FORM_CHECK_MESSAGE,
    fieldErrors: flattenFieldErrors(error),
  };
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

type KeyRow = {
  payloadHash: string;
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
    select: { payloadHash: true, absenceId: true },
  });
}

function replayFromKey(
  key: KeyRow,
  hash: string,
): { kind: "mismatch" } | { kind: "continue" } | { kind: "replay"; absenceId: string } {
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
): Promise<MissedShiftMutationResult> {
  const absence = await tx.absence.findFirst({
    where: { id: absenceId, tenantId },
    select: { staffId: true },
  });
  if (!absence) {
    throw new AbsenceAccessError();
  }
  return { ok: true, absenceId, staffId: absence.staffId, shiftId: null };
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
): Promise<MissedShiftMutationResult | "ready"> {
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
    const raced = await readKey(tx, params);
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
    operation: string;
    key: string;
    absenceId: string;
  },
) {
  await tx.absenceIdempotencyKey.update({
    where: {
      tenantId_actorId_operation_key: {
        tenantId: params.tenantId,
        actorId: params.userId,
        operation: params.operation,
        key: params.key,
      },
    },
    data: { absenceId: params.absenceId },
  });
}

function isShiftUniqueError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

async function loadLiveEvent(db: DbClient, tenantId: string, eventId: string) {
  return db.event.findFirst({
    where: { id: eventId, tenantId, deletedAt: null, archivedAt: null },
    select: {
      id: true,
      name: true,
      reference: true,
      eventDate: true,
      startTime: true,
      endTime: true,
      venueId: true,
      venue: { select: { name: true } },
      eventType: { select: { name: true } },
      eventSubtype: { select: { name: true } },
    },
  });
}

async function shiftConflict(
  db: DbClient,
  params: { tenantId: string; staffId: string; eventId: string; absenceId: string },
): Promise<MissedShiftFailure | null> {
  const same = await db.sicknessMissedShift.findUnique({
    where: {
      absenceId_eventId: {
        absenceId: params.absenceId,
        eventId: params.eventId,
      },
    },
    select: { id: true },
  });
  if (same) {
    return {
      ok: false,
      error: MISSED_SHIFT_DUPLICATE_MESSAGE,
      fieldErrors: { eventId: [MISSED_SHIFT_DUPLICATE_MESSAGE] },
    };
  }
  const clash = await findActiveCancellationOrAwol(db, {
    tenantId: params.tenantId,
    staffId: params.staffId,
    eventId: params.eventId,
  });
  if (clash) {
    return {
      ok: false,
      error: MISSED_SHIFT_ABSENCE_CONFLICT_MESSAGE,
      fieldErrors: { eventId: [MISSED_SHIFT_ABSENCE_CONFLICT_MESSAGE] },
      existingAbsenceId: clash.id,
    };
  }
  const other = await findActiveMissedShift(db, {
    tenantId: params.tenantId,
    staffId: params.staffId,
    eventId: params.eventId,
    excludeAbsenceId: params.absenceId,
  });
  if (other) {
    return {
      ok: false,
      error: MISSED_SHIFT_OTHER_SICKNESS_MESSAGE,
      fieldErrors: { eventId: [MISSED_SHIFT_OTHER_SICKNESS_MESSAGE] },
      existingAbsenceId: other.absenceId,
    };
  }
  return null;
}

export class MissedShiftAttachFailure extends Error {
  readonly result: MissedShiftFailure;

  constructor(result: MissedShiftFailure) {
    super(result.error);
    this.name = "MissedShiftAttachFailure";
    this.result = result;
  }
}

function namedShiftFailure(
  eventName: string,
  failure: MissedShiftFailure,
): MissedShiftFailure {
  const detail = failure.fieldErrors?.eventId?.[0] ?? failure.error;
  const message = `${eventName}: ${detail}`;
  return {
    ...failure,
    error: message,
    fieldErrors: { missedShiftEventIds: [message] },
  };
}

/** Writes booked shifts onto a sickness that is already being created in this transaction. */
export async function attachMissedShifts(
  db: DbClient,
  params: {
    tenantId: string;
    userId: string;
    absenceId: string;
    staffId: string;
    eventIds: string[];
  },
): Promise<{ ok: true } | MissedShiftFailure> {
  for (const eventId of params.eventIds) {
    const event = await loadLiveEvent(db, params.tenantId, eventId);
    if (!event) {
      return {
        ok: false,
        error: FORM_CHECK_MESSAGE,
        fieldErrors: { missedShiftEventIds: [MISSED_SHIFT_EVENT_MESSAGE] },
      };
    }
    const conflict = await shiftConflict(db, {
      tenantId: params.tenantId,
      staffId: params.staffId,
      eventId: event.id,
      absenceId: params.absenceId,
    });
    if (conflict) {
      return namedShiftFailure(event.name, conflict);
    }
    try {
      await db.sicknessMissedShift.create({
        data: {
          tenantId: params.tenantId,
          absenceId: params.absenceId,
          staffId: params.staffId,
          eventId: event.id,
          active: true,
          eventNameSnapshot: event.name,
          eventReferenceSnapshot: event.reference,
          eventDateSnapshot: event.eventDate,
          eventStartTimeSnapshot: event.startTime,
          eventEndTimeSnapshot: event.endTime,
          venueIdSnapshot: event.venueId,
          venueNameSnapshot: event.venue.name,
          eventTypeSnapshot: event.eventType.name,
          eventSubtypeSnapshot: event.eventSubtype.name,
          createdById: params.userId,
        },
      });
      await writeAbsenceHistory(db, {
        tenantId: params.tenantId,
        absenceId: params.absenceId,
        action: "MISSED_SHIFT_ADDED",
        actedById: params.userId,
        changes: [
          {
            field: "missedShift",
            previous: null,
            next: missedShiftHistoryValue({
              eventNameSnapshot: event.name,
              eventDateSnapshot: event.eventDate,
            }),
          },
        ],
      });
    } catch (error) {
      if (!isShiftUniqueError(error)) {
        throw error;
      }
      const raced = await shiftConflict(db, {
        tenantId: params.tenantId,
        staffId: params.staffId,
        eventId: event.id,
        absenceId: params.absenceId,
      });
      return namedShiftFailure(
        event.name,
        raced ?? {
          ok: false,
          error: MISSED_SHIFT_DUPLICATE_MESSAGE,
          fieldErrors: { eventId: [MISSED_SHIFT_DUPLICATE_MESSAGE] },
        },
      );
    }
  }
  return { ok: true };
}

export async function addMissedShift(
  db: PrismaClient,
  params: {
    tenantId: string;
    userId: string;
    input: AddMissedShiftInput;
    now?: Date;
  },
): Promise<MissedShiftMutationResult> {
  const parsed = addMissedShiftSchema.safeParse(params.input);
  if (!parsed.success) {
    return invalid(parsed.error);
  }
  const input = parsed.data;
  const now = params.now ?? new Date();
  const hash = payloadHash({
    absenceId: input.absenceId,
    eventId: input.eventId,
  });

  return db.$transaction(async (tx) => {
    const existingKey = await readKey(tx, {
      tenantId: params.tenantId,
      userId: params.userId,
      operation: SICKNESS_MISSED_SHIFT_ADD_IDEMPOTENCY_OPERATION,
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

    await lockAbsenceRow(tx, params.tenantId, input.absenceId);
    const absence = await tx.absence.findFirst({
      where: { id: input.absenceId, tenantId: params.tenantId },
      select: { id: true, staffId: true, type: true, recordStatus: true },
    });
    if (!absence) {
      throw new AbsenceAccessError();
    }
    if (absence.type !== "SICKNESS") {
      return { ok: false, error: MISSED_SHIFT_UNSUPPORTED_MESSAGE };
    }
    if (absence.recordStatus !== "ACTIVE") {
      return { ok: false, error: MISSED_SHIFT_ARCHIVED_MESSAGE };
    }

    const event = await loadLiveEvent(tx, params.tenantId, input.eventId);
    if (!event) {
      return {
        ok: false,
        error: FORM_CHECK_MESSAGE,
        fieldErrors: { eventId: [MISSED_SHIFT_EVENT_MESSAGE] },
      };
    }

    const conflict = await shiftConflict(tx, {
      tenantId: params.tenantId,
      staffId: absence.staffId,
      eventId: event.id,
      absenceId: absence.id,
    });
    if (conflict) {
      return conflict;
    }

    if (!existingKey) {
      const claimed = await claimKey(tx, {
        tenantId: params.tenantId,
        userId: params.userId,
        operation: SICKNESS_MISSED_SHIFT_ADD_IDEMPOTENCY_OPERATION,
        key: input.idempotencyKey,
        payloadHash: hash,
        now,
      });
      if (claimed !== "ready") {
        return claimed;
      }
    }

    try {
      const shift = await tx.sicknessMissedShift.create({
        data: {
          tenantId: params.tenantId,
          absenceId: absence.id,
          staffId: absence.staffId,
          eventId: event.id,
          active: true,
          eventNameSnapshot: event.name,
          eventReferenceSnapshot: event.reference,
          eventDateSnapshot: event.eventDate,
          eventStartTimeSnapshot: event.startTime,
          eventEndTimeSnapshot: event.endTime,
          venueIdSnapshot: event.venueId,
          venueNameSnapshot: event.venue.name,
          eventTypeSnapshot: event.eventType.name,
          eventSubtypeSnapshot: event.eventSubtype.name,
          createdById: params.userId,
        },
      });
      await writeAbsenceHistory(tx, {
        tenantId: params.tenantId,
        absenceId: absence.id,
        action: "MISSED_SHIFT_ADDED",
        actedById: params.userId,
        changes: [
          {
            field: "missedShift",
            previous: null,
            next: missedShiftHistoryValue({
              eventNameSnapshot: event.name,
              eventDateSnapshot: event.eventDate,
            }),
          },
        ],
      });
      await attachKey(tx, {
        tenantId: params.tenantId,
        userId: params.userId,
        operation: SICKNESS_MISSED_SHIFT_ADD_IDEMPOTENCY_OPERATION,
        key: input.idempotencyKey,
        absenceId: absence.id,
      });
      return {
        ok: true,
        absenceId: absence.id,
        staffId: absence.staffId,
        shiftId: shift.id,
      };
    } catch (error) {
      if (!isShiftUniqueError(error)) {
        throw error;
      }
      const raced = await shiftConflict(tx, {
        tenantId: params.tenantId,
        staffId: absence.staffId,
        eventId: event.id,
        absenceId: absence.id,
      });
      return (
        raced ?? {
          ok: false,
          error: MISSED_SHIFT_DUPLICATE_MESSAGE,
          fieldErrors: { eventId: [MISSED_SHIFT_DUPLICATE_MESSAGE] },
        }
      );
    }
  });
}

export async function removeMissedShift(
  db: PrismaClient,
  params: {
    tenantId: string;
    userId: string;
    input: RemoveMissedShiftInput;
    now?: Date;
  },
): Promise<MissedShiftMutationResult> {
  const parsed = removeMissedShiftSchema.safeParse(params.input);
  if (!parsed.success) {
    return invalid(parsed.error);
  }
  const input = parsed.data;
  const now = params.now ?? new Date();
  const hash = payloadHash({
    absenceId: input.absenceId,
    shiftId: input.shiftId,
  });

  return db.$transaction(async (tx) => {
    const existingKey = await readKey(tx, {
      tenantId: params.tenantId,
      userId: params.userId,
      operation: SICKNESS_MISSED_SHIFT_REMOVE_IDEMPOTENCY_OPERATION,
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

    await lockAbsenceRow(tx, params.tenantId, input.absenceId);
    const absence = await tx.absence.findFirst({
      where: { id: input.absenceId, tenantId: params.tenantId },
      select: { id: true, staffId: true, type: true, recordStatus: true },
    });
    if (!absence) {
      throw new AbsenceAccessError();
    }
    if (absence.type !== "SICKNESS") {
      return { ok: false, error: MISSED_SHIFT_UNSUPPORTED_MESSAGE };
    }
    if (absence.recordStatus !== "ACTIVE") {
      return { ok: false, error: MISSED_SHIFT_ARCHIVED_MESSAGE };
    }

    const shift = await tx.sicknessMissedShift.findFirst({
      where: {
        id: input.shiftId,
        tenantId: params.tenantId,
        absenceId: absence.id,
      },
    });
    if (!shift) {
      return { ok: false, error: MISSED_SHIFT_NOT_FOUND_MESSAGE };
    }

    if (!existingKey) {
      const claimed = await claimKey(tx, {
        tenantId: params.tenantId,
        userId: params.userId,
        operation: SICKNESS_MISSED_SHIFT_REMOVE_IDEMPOTENCY_OPERATION,
        key: input.idempotencyKey,
        payloadHash: hash,
        now,
      });
      if (claimed !== "ready") {
        return claimed;
      }
    }

    await tx.sicknessMissedShift.delete({ where: { id: shift.id } });
    await writeAbsenceHistory(tx, {
      tenantId: params.tenantId,
      absenceId: absence.id,
      action: "MISSED_SHIFT_REMOVED",
      actedById: params.userId,
      changes: [
        {
          field: "missedShift",
          previous: missedShiftHistoryValue(shift),
          next: null,
        },
      ],
    });
    await attachKey(tx, {
      tenantId: params.tenantId,
      userId: params.userId,
      operation: SICKNESS_MISSED_SHIFT_REMOVE_IDEMPOTENCY_OPERATION,
      key: input.idempotencyKey,
      absenceId: absence.id,
    });
    return {
      ok: true,
      absenceId: absence.id,
      staffId: absence.staffId,
      shiftId: null,
    };
  });
}

export async function deactivateMissedShifts(
  db: DbClient,
  params: { tenantId: string; absenceId: string },
) {
  await db.sicknessMissedShift.updateMany({
    where: {
      tenantId: params.tenantId,
      absenceId: params.absenceId,
      active: true,
    },
    data: { active: false },
  });
}

export async function retargetMissedShiftStaff(
  db: DbClient,
  params: { tenantId: string; absenceId: string; staffId: string },
): Promise<{ ok: true } | MissedShiftFailure> {
  const shifts = await db.sicknessMissedShift.findMany({
    where: {
      tenantId: params.tenantId,
      absenceId: params.absenceId,
      active: true,
    },
    select: { id: true, eventId: true },
  });
  for (const shift of shifts) {
    const clash = await findActiveCancellationOrAwol(db, {
      tenantId: params.tenantId,
      staffId: params.staffId,
      eventId: shift.eventId,
    });
    if (clash) {
      return {
        ok: false,
        error: MISSED_SHIFT_STAFF_CONFLICT_MESSAGE,
        fieldErrors: { staffId: [MISSED_SHIFT_STAFF_CONFLICT_MESSAGE] },
        existingAbsenceId: clash.id,
      };
    }
    const other = await findActiveMissedShift(db, {
      tenantId: params.tenantId,
      staffId: params.staffId,
      eventId: shift.eventId,
      excludeAbsenceId: params.absenceId,
    });
    if (other) {
      return {
        ok: false,
        error: MISSED_SHIFT_STAFF_CONFLICT_MESSAGE,
        fieldErrors: { staffId: [MISSED_SHIFT_STAFF_CONFLICT_MESSAGE] },
        existingAbsenceId: other.absenceId,
      };
    }
  }
  if (shifts.length > 0) {
    await db.sicknessMissedShift.updateMany({
      where: { tenantId: params.tenantId, absenceId: params.absenceId },
      data: { staffId: params.staffId },
    });
  }
  return { ok: true };
}
