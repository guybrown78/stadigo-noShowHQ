import { createHash } from "node:crypto";
import {
  Prisma,
  type PrismaClient,
} from "@prisma/client";
import { FORM_CHECK_MESSAGE } from "@/lib/form";
import { AbsenceAccessError } from "@/lib/absence/errors";
import {
  AWOL_CREATE_IDEMPOTENCY_OPERATION,
  IDEMPOTENCY_TTL_MS,
  SICKNESS_CREATE_IDEMPOTENCY_OPERATION,
  SICKNESS_EPISODE_UPDATE_IDEMPOTENCY_OPERATION,
} from "@/lib/absence/catalog";
import { diffValues, writeAbsenceHistory } from "@/lib/absence/history";
import { calculateNotice } from "@/lib/absence/notice";
import {
  evaluateAwolEventEligibility,
  evaluateAwolReportedDate,
} from "@/lib/absence/eligibility";
import {
  findActiveCancellationOrAwol,
  findActiveDuplicateCancellation,
  findActiveSicknessDuplicate,
  getAbsenceForTenant,
  getTenantTimezone,
} from "@/lib/absence/queries";
import type {
  ArchiveAwolInput,
  ArchiveCancellationInput,
  ArchiveSicknessInput,
  AwolInput,
  CancellationInput,
  CorrectAwolInput,
  CorrectCancellationInput,
  CorrectSicknessInput,
  SicknessInput,
  UpdateSicknessEpisodeInput,
} from "@/lib/absence/schema";
import {
  DUPLICATE_SICKNESS_MESSAGE,
  SICKNESS_ARCHIVED_CANNOT_UPDATE,
  SICKNESS_NO_CHANGE_MESSAGE,
  correctionConflictsWithEndedEpisode,
  defaultSicknessEpisodeState,
  evaluateSicknessDates,
  evaluateSicknessEpisodeUpdate,
  requiresCorrectionAdvanceConfirmation,
  sicknessEpisodeHistoryChanges,
} from "@/lib/absence/sickness";
import { TenantTimezoneError, todayIsoInTimeZone } from "@/lib/absence/timezone";
import { formatLocalDateIso, parseLocalDate } from "@/lib/events/dates";
import { formatStaffName } from "@/lib/staff/display";

export { AbsenceAccessError };

export type AbsenceMutationResult =
  | { ok: true; id: string }
  | {
      ok: false;
      error: string;
      fieldErrors?: Record<string, string[]>;
      existingAbsenceId?: string;
    };

type DbClient = PrismaClient | Prisma.TransactionClient;

const DUPLICATE_CANCELLATION_MESSAGE =
  "An active Cancellation already exists for this staff member and event.";
const DUPLICATE_AWOL_MESSAGE =
  "An active AWOL already exists for this staff member and event.";
const CONFLICT_MESSAGE =
  "An active absence already exists for this staff member and event.";
const STALE_WRITE_MESSAGE =
  "This record was changed by someone else. Reload and try again.";
const IDEMPOTENCY_REUSE_MESSAGE =
  "This save was already used with different details. Refresh the page and try again.";
const ARCHIVED_CANNOT_CORRECT = "Archived records cannot be corrected.";

type LoadedEvent = {
  id: string;
  name: string;
  reference: string | null;
  eventDate: Date;
  startTime: string | null;
  endTime: string | null;
  venueId: string;
  venue: { name: string };
  eventType: { name: string };
  eventSubtype: { name: string };
};

function uniqueTarget(error: Prisma.PrismaClientKnownRequestError): string[] {
  const target = error.meta?.target;
  if (Array.isArray(target)) {
    return target.map(String);
  }
  if (typeof target === "string") {
    return [target];
  }
  return [];
}

function isActiveSlotUniqueError(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }
  const target = uniqueTarget(error);
  return target.some(
    (part) =>
      part.includes("staffId") ||
      part.includes("eventId") ||
      part.includes("Absence_tenantId_staffId_eventId_type_active") ||
      part.includes("Absence_tenantId_staffId_eventId_active_cancellation_awol"),
  );
}

function conflictResult(
  existingId: string,
  existingType: "CANCELLATION" | "AWOL" | string,
  writingType: "CANCELLATION" | "AWOL",
): Extract<AbsenceMutationResult, { ok: false }> {
  const message =
    existingType === writingType
      ? writingType === "CANCELLATION"
        ? DUPLICATE_CANCELLATION_MESSAGE
        : DUPLICATE_AWOL_MESSAGE
      : CONFLICT_MESSAGE;
  return {
    ok: false,
    error: message,
    fieldErrors: { eventId: [message] },
    existingAbsenceId: existingId,
  };
}

function dateString(value: Date): string {
  return formatLocalDateIso(value);
}

async function loadLiveStaff(
  db: DbClient,
  tenantId: string,
  staffId: string,
) {
  return db.staff.findFirst({
    where: { id: staffId, tenantId, deletedAt: null },
    select: {
      id: true,
      staffIdNumber: true,
      firstName: true,
      lastName: true,
      employmentStatus: true,
    },
  });
}

async function loadLiveEvent(
  db: DbClient,
  tenantId: string,
  eventId: string,
): Promise<LoadedEvent | null> {
  return db.event.findFirst({
    where: { id: eventId, tenantId, deletedAt: null },
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

function staffLabel(staff: {
  firstName: string;
  lastName: string;
  staffIdNumber: string;
}): string {
  return `${formatStaffName(staff)} (${staff.staffIdNumber})`;
}

function staffDisplaySnapshot(staff: {
  firstName: string;
  lastName: string;
  staffIdNumber: string;
}) {
  return {
    staffFirstNameSnapshot: staff.firstName,
    staffLastNameSnapshot: staff.lastName,
    staffIdNumberSnapshot: staff.staffIdNumber,
  };
}

function eventLabel(event: LoadedEvent): string {
  return `${event.name} (${dateString(event.eventDate)})`;
}

function timestampsMatch(actual: Date, expected: string): boolean {
  const parsed = Date.parse(expected);
  if (Number.isNaN(parsed)) {
    return false;
  }
  return actual.getTime() === parsed;
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

function awolPayloadHash(input: {
  staffId: string;
  eventId: string;
  reportedDate: string;
  notes: string | null;
  sameDayStartUnknownConfirmed: boolean;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        staffId: input.staffId,
        eventId: input.eventId,
        reportedDate: input.reportedDate,
        notes: input.notes,
        sameDayStartUnknownConfirmed: input.sameDayStartUnknownConfirmed,
      }),
    )
    .digest("hex");
}

type ResolvedCancellationWrite =
  | {
      ok: true;
      staff: NonNullable<Awaited<ReturnType<typeof loadLiveStaff>>>;
      event: LoadedEvent;
      reportedDate: Date;
      notice: ReturnType<typeof calculateNotice>;
    }
  | Extract<AbsenceMutationResult, { ok: false }>;

async function resolveCancellationWrite(
  db: DbClient,
  params: {
    tenantId: string;
    input: CancellationInput;
    excludeId?: string;
  },
): Promise<ResolvedCancellationWrite> {
  if (params.input.type !== "CANCELLATION") {
    return {
      ok: false,
      error: FORM_CHECK_MESSAGE,
      fieldErrors: {
        type: ["Only Cancellation can be logged in this release"],
      },
    };
  }

  const reportedDate = parseLocalDate(params.input.reportedDate);
  if (!reportedDate) {
    return {
      ok: false,
      error: FORM_CHECK_MESSAGE,
      fieldErrors: { reportedDate: ["Enter a valid date"] },
    };
  }

  const staff = await loadLiveStaff(db, params.tenantId, params.input.staffId);
  if (!staff) {
    return {
      ok: false,
      error: FORM_CHECK_MESSAGE,
      fieldErrors: { staffId: ["Select a valid staff member"] },
    };
  }

  const event = await loadLiveEvent(db, params.tenantId, params.input.eventId);
  if (!event) {
    return {
      ok: false,
      error: FORM_CHECK_MESSAGE,
      fieldErrors: { eventId: ["Select a valid event"] },
    };
  }

  const notice = calculateNotice({
    eventDate: event.eventDate,
    eventStartTime: event.startTime,
    reportedDate,
    reportedTime: params.input.reportedTime,
  });
  if (notice.isRetrospective && !params.input.retrospectiveConfirmed) {
    return {
      ok: false,
      error: FORM_CHECK_MESSAGE,
      fieldErrors: {
        retrospectiveConfirmed: [
          "Confirm this is a retrospective or late record",
        ],
      },
    };
  }

  const existing = await findActiveCancellationOrAwol(db, {
    tenantId: params.tenantId,
    staffId: staff.id,
    eventId: event.id,
    excludeId: params.excludeId,
  });
  if (existing) {
    return conflictResult(existing.id, existing.type, "CANCELLATION");
  }

  return { ok: true, staff, event, reportedDate, notice };
}

function cancellationSnapshot(
  event: LoadedEvent,
  notice: ReturnType<typeof calculateNotice>,
) {
  return {
    eventNameSnapshot: event.name,
    eventDateSnapshot: event.eventDate,
    eventStartTimeSnapshot: event.startTime,
    venueIdSnapshot: event.venueId,
    venueNameSnapshot: event.venue.name,
    noticeMinutes: notice.noticeMinutes,
    noticeCalendarDays: notice.noticeCalendarDays,
    noticeBasis: notice.noticeBasis,
    isShortNotice: notice.isShortNotice,
  };
}

async function slotConflictFromError(
  db: DbClient,
  params: {
    tenantId: string;
    staffId: string;
    eventId: string;
    excludeId?: string;
    writingType: "CANCELLATION" | "AWOL";
  },
): Promise<Extract<AbsenceMutationResult, { ok: false }> | null> {
  const existing = await findActiveCancellationOrAwol(db, {
    tenantId: params.tenantId,
    staffId: params.staffId,
    eventId: params.eventId,
    excludeId: params.excludeId,
  });
  if (!existing) {
    return null;
  }
  return conflictResult(existing.id, existing.type, params.writingType);
}

async function withSlotConflictMapping(
  db: PrismaClient,
  params: {
    tenantId: string;
    staffId: string;
    eventId: string;
    excludeId?: string;
    writingType: "CANCELLATION" | "AWOL";
  },
  run: () => Promise<AbsenceMutationResult>,
): Promise<AbsenceMutationResult> {
  try {
    return await run();
  } catch (error) {
    if (!isActiveSlotUniqueError(error)) {
      throw error;
    }
    const conflict = await slotConflictFromError(db, params);
    if (conflict) {
      return conflict;
    }
    return {
      ok: false,
      error: CONFLICT_MESSAGE,
      fieldErrors: { eventId: [CONFLICT_MESSAGE] },
    };
  }
}

export async function createCancellation(
  db: PrismaClient,
  params: {
    tenantId: string;
    userId: string;
    input: CancellationInput;
  },
): Promise<AbsenceMutationResult> {
  return withSlotConflictMapping(
    db,
    {
      tenantId: params.tenantId,
      staffId: params.input.staffId,
      eventId: params.input.eventId,
      writingType: "CANCELLATION",
    },
    () =>
      db.$transaction(async (tx) => {
    const resolved = await resolveCancellationWrite(tx, {
      tenantId: params.tenantId,
      input: params.input,
    });
    if (!resolved.ok) {
      return resolved;
    }

    const snapshot = cancellationSnapshot(resolved.event, resolved.notice);

    const absence = await tx.absence.create({
        data: {
          tenantId: params.tenantId,
          staffId: resolved.staff.id,
          eventId: resolved.event.id,
          type: "CANCELLATION",
          reportedDate: resolved.reportedDate,
          reportedTime: params.input.reportedTime,
          reason: params.input.reason,
          notes: params.input.notes,
          followUpType: "REVIEW",
          followUpStatus: "PENDING",
          recordStatus: "ACTIVE",
          createdById: params.userId,
          updatedById: params.userId,
        },
      });

      await tx.cancellationDetail.create({
        data: {
          absenceId: absence.id,
          tenantId: params.tenantId,
          ...snapshot,
        },
      });

      await writeAbsenceHistory(tx, {
        tenantId: params.tenantId,
        absenceId: absence.id,
        action: "CREATED",
        actedById: params.userId,
        changes: [
          { field: "staffId", previous: null, next: staffLabel(resolved.staff) },
          { field: "eventId", previous: null, next: eventLabel(resolved.event) },
          {
            field: "reportedDate",
            previous: null,
            next: dateString(resolved.reportedDate),
          },
          {
            field: "reportedTime",
            previous: null,
            next: params.input.reportedTime,
          },
          {
            field: "noticeCalendarDays",
            previous: null,
            next: String(resolved.notice.noticeCalendarDays),
          },
          {
            field: "noticeBasis",
            previous: null,
            next: resolved.notice.noticeBasis,
          },
        ],
      });

      return { ok: true, id: absence.id };
      }),
  );
}

export async function correctCancellation(
  db: PrismaClient,
  params: {
    tenantId: string;
    userId: string;
    absenceId: string;
    input: CorrectCancellationInput;
  },
): Promise<AbsenceMutationResult> {
  return withSlotConflictMapping(
    db,
    {
      tenantId: params.tenantId,
      staffId: params.input.staffId,
      eventId: params.input.eventId,
      excludeId: params.absenceId,
      writingType: "CANCELLATION",
    },
    () =>
      db.$transaction(async (tx) => {
    const existing = await tx.absence.findFirst({
      where: { id: params.absenceId, tenantId: params.tenantId },
      include: { cancellation: true, staff: true },
    });
    if (!existing) {
      throw new AbsenceAccessError();
    }
    if (existing.recordStatus === "ARCHIVED") {
      return {
        ok: false,
        error: "Archived cancellations cannot be corrected.",
      };
    }
    if (existing.type !== "CANCELLATION" || !existing.cancellation) {
      return { ok: false, error: "This record cannot be corrected here." };
    }

    const resolved = await resolveCancellationWrite(tx, {
      tenantId: params.tenantId,
      input: params.input,
      excludeId: existing.id,
    });
    if (!resolved.ok) {
      return resolved;
    }

    const snapshot = cancellationSnapshot(resolved.event, resolved.notice);
    const previousStaffLabel = staffLabel(existing.staff);
    const previousEventLabel = existing.cancellation
      ? `${existing.cancellation.eventNameSnapshot} (${dateString(existing.cancellation.eventDateSnapshot)})`
      : null;

    const changes = [
      diffValues(previousStaffLabel, staffLabel(resolved.staff)) && {
        field: "staffId",
        ...diffValues(previousStaffLabel, staffLabel(resolved.staff))!,
      },
      diffValues(previousEventLabel, eventLabel(resolved.event)) && {
        field: "eventId",
        ...diffValues(previousEventLabel, eventLabel(resolved.event))!,
      },
      diffValues(dateString(existing.reportedDate), dateString(resolved.reportedDate)) && {
        field: "reportedDate",
        ...diffValues(
          dateString(existing.reportedDate),
          dateString(resolved.reportedDate),
        )!,
      },
      diffValues(existing.reportedTime, params.input.reportedTime) && {
        field: "reportedTime",
        ...diffValues(existing.reportedTime, params.input.reportedTime)!,
      },
      diffValues(existing.reason, params.input.reason) && {
        field: "reason",
        ...diffValues(existing.reason, params.input.reason)!,
      },
      diffValues(existing.notes, params.input.notes) && {
        field: "notes",
        ...diffValues(existing.notes, params.input.notes)!,
      },
      diffValues(
        String(existing.cancellation.noticeCalendarDays),
        String(resolved.notice.noticeCalendarDays),
      ) && {
        field: "noticeCalendarDays",
        ...diffValues(
          String(existing.cancellation.noticeCalendarDays),
          String(resolved.notice.noticeCalendarDays),
        )!,
      },
      diffValues(
        existing.cancellation.noticeMinutes == null
          ? null
          : String(existing.cancellation.noticeMinutes),
        resolved.notice.noticeMinutes == null
          ? null
          : String(resolved.notice.noticeMinutes),
      ) && {
        field: "noticeMinutes",
        ...diffValues(
          existing.cancellation.noticeMinutes == null
            ? null
            : String(existing.cancellation.noticeMinutes),
          resolved.notice.noticeMinutes == null
            ? null
            : String(resolved.notice.noticeMinutes),
        )!,
      },
      diffValues(existing.cancellation.noticeBasis, resolved.notice.noticeBasis) && {
        field: "noticeBasis",
        ...diffValues(
          existing.cancellation.noticeBasis,
          resolved.notice.noticeBasis,
        )!,
      },
      diffValues(
        String(existing.cancellation.isShortNotice),
        String(resolved.notice.isShortNotice),
      ) && {
        field: "isShortNotice",
        ...diffValues(
          String(existing.cancellation.isShortNotice),
          String(resolved.notice.isShortNotice),
        )!,
      },
      diffValues(
        existing.cancellation.eventNameSnapshot,
        snapshot.eventNameSnapshot,
      ) && {
        field: "eventNameSnapshot",
        ...diffValues(
          existing.cancellation.eventNameSnapshot,
          snapshot.eventNameSnapshot,
        )!,
      },
      diffValues(
        dateString(existing.cancellation.eventDateSnapshot),
        dateString(snapshot.eventDateSnapshot),
      ) && {
        field: "eventDateSnapshot",
        ...diffValues(
          dateString(existing.cancellation.eventDateSnapshot),
          dateString(snapshot.eventDateSnapshot),
        )!,
      },
      diffValues(
        existing.cancellation.venueNameSnapshot,
        snapshot.venueNameSnapshot,
      ) && {
        field: "venueNameSnapshot",
        ...diffValues(
          existing.cancellation.venueNameSnapshot,
          snapshot.venueNameSnapshot,
        )!,
      },
    ].filter((change): change is { field: string; previous: string | null; next: string | null } =>
      Boolean(change),
    );

    try {
      await tx.absence.update({
        where: { id: existing.id },
        data: {
          staffId: resolved.staff.id,
          eventId: resolved.event.id,
          reportedDate: resolved.reportedDate,
          reportedTime: params.input.reportedTime,
          reason: params.input.reason,
          notes: params.input.notes,
          updatedById: params.userId,
          cancellation: {
            update: snapshot,
          },
        },
      });

      await writeAbsenceHistory(tx, {
        tenantId: params.tenantId,
        absenceId: existing.id,
        action: "CORRECTED",
        reason: params.input.correctionReason,
        actedById: params.userId,
        changes,
      });

      return { ok: true, id: existing.id };
    } catch (error) {
      if (isActiveSlotUniqueError(error)) {
        throw error;
      }
      throw error;
    }
      }),
  );
}

export async function archiveCancellation(
  db: PrismaClient,
  params: {
    tenantId: string;
    userId: string;
    absenceId: string;
    input: ArchiveCancellationInput;
  },
): Promise<AbsenceMutationResult> {
  return db.$transaction(async (tx) => {
    const existing = await tx.absence.findFirst({
      where: { id: params.absenceId, tenantId: params.tenantId },
      include: { cancellation: true, staff: true },
    });
    if (!existing) {
      throw new AbsenceAccessError();
    }
    if (existing.recordStatus === "ARCHIVED") {
      return {
        ok: false,
        error: "This cancellation is already archived.",
      };
    }

    await tx.absence.update({
      where: { id: existing.id },
      data: {
        recordStatus: "ARCHIVED",
        archivedAt: new Date(),
        archivedById: params.userId,
        archiveReason: params.input.archiveReason,
        updatedById: params.userId,
      },
    });

    await writeAbsenceHistory(tx, {
      tenantId: params.tenantId,
      absenceId: existing.id,
      action: "ARCHIVED",
      reason: params.input.archiveReason,
      actedById: params.userId,
      changes: [
        {
          field: "recordStatus",
          previous: "ACTIVE",
          next: "ARCHIVED",
        },
      ],
    });

    return { ok: true, id: existing.id };
  });
}

function awolSnapshot(
  event: LoadedEvent,
  sameDayStartUnknownConfirmed: boolean,
) {
  return {
    eventNameSnapshot: event.name,
    eventReferenceSnapshot: event.reference,
    eventDateSnapshot: event.eventDate,
    eventStartTimeSnapshot: event.startTime,
    eventEndTimeSnapshot: event.endTime,
    venueIdSnapshot: event.venueId,
    venueNameSnapshot: event.venue.name,
    eventTypeSnapshot: event.eventType.name,
    eventSubtypeSnapshot: event.eventSubtype.name,
    sameDayStartUnknownConfirmed,
  };
}

type ResolvedAwolWrite =
  | {
      ok: true;
      staff: NonNullable<Awaited<ReturnType<typeof loadLiveStaff>>>;
      event: LoadedEvent;
      reportedDate: Date;
      sameDayStartUnknownConfirmed: boolean;
    }
  | Extract<AbsenceMutationResult, { ok: false }>;

async function resolveAwolWrite(
  db: DbClient,
  params: {
    tenantId: string;
    input: Pick<
      AwolInput,
      | "type"
      | "staffId"
      | "eventId"
      | "reportedDate"
      | "sameDayStartUnknownConfirmed"
    >;
    excludeId?: string;
    now?: Date;
  },
): Promise<ResolvedAwolWrite> {
  if (params.input.type !== "AWOL") {
    return {
      ok: false,
      error: FORM_CHECK_MESSAGE,
      fieldErrors: { type: ["Only AWOL can be logged with this form"] },
    };
  }

  let timeZone: string;
  try {
    timeZone = await getTenantTimezone(db, params.tenantId);
  } catch (error) {
    if (error instanceof TenantTimezoneError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }

  const reportedDate = parseLocalDate(params.input.reportedDate);
  if (!reportedDate) {
    return {
      ok: false,
      error: FORM_CHECK_MESSAGE,
      fieldErrors: { reportedDate: ["Enter a valid date"] },
    };
  }

  const staff = await loadLiveStaff(db, params.tenantId, params.input.staffId);
  if (!staff) {
    return {
      ok: false,
      error: FORM_CHECK_MESSAGE,
      fieldErrors: { staffId: ["Select a valid staff member"] },
    };
  }

  const event = await loadLiveEvent(db, params.tenantId, params.input.eventId);
  if (!event) {
    return {
      ok: false,
      error: FORM_CHECK_MESSAGE,
      fieldErrors: { eventId: ["Select a valid event"] },
    };
  }

  const now = params.now ?? new Date();
  const eligibility = evaluateAwolEventEligibility({
    eventDate: event.eventDate,
    eventStartTime: event.startTime,
    sameDayStartUnknownConfirmed: params.input.sameDayStartUnknownConfirmed,
    timeZone,
    now,
  });
  if (!eligibility.ok) {
    if (eligibility.field === "timezone") {
      return { ok: false, error: eligibility.message };
    }
    return {
      ok: false,
      error: FORM_CHECK_MESSAGE,
      fieldErrors: { [eligibility.field]: [eligibility.message] },
    };
  }

  const reported = evaluateAwolReportedDate({
    reportedDate,
    eventDate: event.eventDate,
    timeZone,
    now,
  });
  if (!reported.ok) {
    if (reported.field === "timezone") {
      return { ok: false, error: reported.message };
    }
    return {
      ok: false,
      error: FORM_CHECK_MESSAGE,
      fieldErrors: { [reported.field]: [reported.message] },
    };
  }

  const existing = await findActiveCancellationOrAwol(db, {
    tenantId: params.tenantId,
    staffId: staff.id,
    eventId: event.id,
    excludeId: params.excludeId,
  });
  if (existing) {
    return conflictResult(existing.id, existing.type, "AWOL");
  }

  return {
    ok: true,
    staff,
    event,
    reportedDate,
    sameDayStartUnknownConfirmed: eligibility.requiresSameDayConfirmation,
  };
}

export async function createAwol(
  db: PrismaClient,
  params: {
    tenantId: string;
    userId: string;
    input: AwolInput;
    now?: Date;
  },
): Promise<AbsenceMutationResult> {
  const now = params.now ?? new Date();
  const payloadHash = awolPayloadHash(params.input);

  return withSlotConflictMapping(
    db,
    {
      tenantId: params.tenantId,
      staffId: params.input.staffId,
      eventId: params.input.eventId,
      writingType: "AWOL",
    },
    () =>
      db.$transaction(async (tx) => {
    await tx.absenceIdempotencyKey.deleteMany({
      where: {
        tenantId: params.tenantId,
        actorId: params.userId,
        operation: AWOL_CREATE_IDEMPOTENCY_OPERATION,
        expiresAt: { lt: now },
      },
    });

    const existingKey = await tx.absenceIdempotencyKey.findUnique({
      where: {
        tenantId_actorId_operation_key: {
          tenantId: params.tenantId,
          actorId: params.userId,
          operation: AWOL_CREATE_IDEMPOTENCY_OPERATION,
          key: params.input.idempotencyKey,
        },
      },
    });
    if (existingKey) {
      if (existingKey.payloadHash !== payloadHash) {
        return {
          ok: false,
          error: IDEMPOTENCY_REUSE_MESSAGE,
        };
      }
      if (existingKey.absenceId) {
        return { ok: true, id: existingKey.absenceId };
      }
    } else {
      try {
        await tx.absenceIdempotencyKey.create({
          data: {
            tenantId: params.tenantId,
            actorId: params.userId,
            operation: AWOL_CREATE_IDEMPOTENCY_OPERATION,
            key: params.input.idempotencyKey,
            payloadHash,
            expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          const raced = await tx.absenceIdempotencyKey.findUnique({
            where: {
              tenantId_actorId_operation_key: {
                tenantId: params.tenantId,
                actorId: params.userId,
                operation: AWOL_CREATE_IDEMPOTENCY_OPERATION,
                key: params.input.idempotencyKey,
              },
            },
          });
          if (raced?.payloadHash !== payloadHash) {
            return { ok: false, error: IDEMPOTENCY_REUSE_MESSAGE };
          }
          if (raced?.absenceId) {
            return { ok: true, id: raced.absenceId };
          }
        } else {
          throw error;
        }
      }
    }

    const resolved = await resolveAwolWrite(tx, {
      tenantId: params.tenantId,
      input: params.input,
      now,
    });
    if (!resolved.ok) {
      return resolved;
    }

    const snapshot = awolSnapshot(
      resolved.event,
      resolved.sameDayStartUnknownConfirmed,
    );

    try {
      const absence = await tx.absence.create({
        data: {
          tenantId: params.tenantId,
          staffId: resolved.staff.id,
          eventId: resolved.event.id,
          type: "AWOL",
          reportedDate: resolved.reportedDate,
          reportedTime: null,
          reason: null,
          notes: params.input.notes,
          followUpType: "REVIEW",
          followUpStatus: "PENDING",
          recordStatus: "ACTIVE",
          createdById: params.userId,
          updatedById: params.userId,
        },
      });

      await tx.awolDetail.create({
        data: {
          absenceId: absence.id,
          tenantId: params.tenantId,
          ...snapshot,
        },
      });

      await writeAbsenceHistory(tx, {
        tenantId: params.tenantId,
        absenceId: absence.id,
        action: "CREATED",
        actedById: params.userId,
        changes: [
          { field: "staffId", previous: null, next: staffLabel(resolved.staff) },
          { field: "eventId", previous: null, next: eventLabel(resolved.event) },
          {
            field: "reportedDate",
            previous: null,
            next: dateString(resolved.reportedDate),
          },
          {
            field: "notes",
            previous: null,
            next: params.input.notes,
          },
        ],
      });

      await tx.absenceIdempotencyKey.updateMany({
        where: {
          tenantId: params.tenantId,
          actorId: params.userId,
          operation: AWOL_CREATE_IDEMPOTENCY_OPERATION,
          key: params.input.idempotencyKey,
        },
        data: { absenceId: absence.id, payloadHash },
      });

      return { ok: true, id: absence.id };
    } catch (error) {
      if (isActiveSlotUniqueError(error)) {
        throw error;
      }
      throw error;
    }
      }),
  );
}

export async function correctAwol(
  db: PrismaClient,
  params: {
    tenantId: string;
    userId: string;
    absenceId: string;
    input: CorrectAwolInput;
    now?: Date;
  },
): Promise<AbsenceMutationResult> {
  return withSlotConflictMapping(
    db,
    {
      tenantId: params.tenantId,
      staffId: params.input.staffId,
      eventId: params.input.eventId,
      excludeId: params.absenceId,
      writingType: "AWOL",
    },
    () =>
      db.$transaction(async (tx) => {
    await lockAbsenceRow(tx, params.tenantId, params.absenceId);
    const existing = await tx.absence.findFirst({
      where: { id: params.absenceId, tenantId: params.tenantId },
      include: { awol: true, staff: true },
    });
    if (!existing) {
      throw new AbsenceAccessError();
    }
    if (existing.recordStatus !== "ACTIVE") {
      return { ok: false, error: ARCHIVED_CANNOT_CORRECT };
    }
    if (existing.type !== "AWOL" || !existing.awol) {
      return { ok: false, error: "This record cannot be corrected here." };
    }
    if (!timestampsMatch(existing.updatedAt, params.input.expectedUpdatedAt)) {
      return { ok: false, error: STALE_WRITE_MESSAGE };
    }

    const resolved = await resolveAwolWrite(tx, {
      tenantId: params.tenantId,
      input: params.input,
      excludeId: existing.id,
      now: params.now,
    });
    if (!resolved.ok) {
      return resolved;
    }

    const snapshot = awolSnapshot(
      resolved.event,
      resolved.sameDayStartUnknownConfirmed,
    );
    const previousStaffLabel = staffLabel(existing.staff);
    const previousEventLabel = `${existing.awol.eventNameSnapshot} (${dateString(existing.awol.eventDateSnapshot)})`;

    const changes = [
      diffValues(previousStaffLabel, staffLabel(resolved.staff)) && {
        field: "staffId",
        ...diffValues(previousStaffLabel, staffLabel(resolved.staff))!,
      },
      diffValues(previousEventLabel, eventLabel(resolved.event)) && {
        field: "eventId",
        ...diffValues(previousEventLabel, eventLabel(resolved.event))!,
      },
      diffValues(dateString(existing.reportedDate), dateString(resolved.reportedDate)) && {
        field: "reportedDate",
        ...diffValues(
          dateString(existing.reportedDate),
          dateString(resolved.reportedDate),
        )!,
      },
      diffValues(existing.notes, params.input.notes) && {
        field: "notes",
        ...diffValues(existing.notes, params.input.notes)!,
      },
      diffValues(
        existing.awol.eventNameSnapshot,
        snapshot.eventNameSnapshot,
      ) && {
        field: "eventNameSnapshot",
        ...diffValues(
          existing.awol.eventNameSnapshot,
          snapshot.eventNameSnapshot,
        )!,
      },
      diffValues(
        existing.awol.eventReferenceSnapshot,
        snapshot.eventReferenceSnapshot,
      ) && {
        field: "eventReferenceSnapshot",
        ...diffValues(
          existing.awol.eventReferenceSnapshot,
          snapshot.eventReferenceSnapshot,
        )!,
      },
      diffValues(
        dateString(existing.awol.eventDateSnapshot),
        dateString(snapshot.eventDateSnapshot),
      ) && {
        field: "eventDateSnapshot",
        ...diffValues(
          dateString(existing.awol.eventDateSnapshot),
          dateString(snapshot.eventDateSnapshot),
        )!,
      },
      diffValues(
        existing.awol.eventStartTimeSnapshot,
        snapshot.eventStartTimeSnapshot,
      ) && {
        field: "eventStartTimeSnapshot",
        ...diffValues(
          existing.awol.eventStartTimeSnapshot,
          snapshot.eventStartTimeSnapshot,
        )!,
      },
      diffValues(
        existing.awol.venueNameSnapshot,
        snapshot.venueNameSnapshot,
      ) && {
        field: "venueNameSnapshot",
        ...diffValues(
          existing.awol.venueNameSnapshot,
          snapshot.venueNameSnapshot,
        )!,
      },
      diffValues(existing.awol.eventTypeSnapshot, snapshot.eventTypeSnapshot) && {
        field: "eventTypeSnapshot",
        ...diffValues(
          existing.awol.eventTypeSnapshot,
          snapshot.eventTypeSnapshot,
        )!,
      },
    ].filter((change): change is { field: string; previous: string | null; next: string | null } =>
      Boolean(change),
    );

    try {
      await tx.absence.update({
        where: { id: existing.id },
        data: {
          staffId: resolved.staff.id,
          eventId: resolved.event.id,
          reportedDate: resolved.reportedDate,
          notes: params.input.notes,
          updatedById: params.userId,
          awol: {
            update: snapshot,
          },
        },
      });

      await writeAbsenceHistory(tx, {
        tenantId: params.tenantId,
        absenceId: existing.id,
        action: "CORRECTED",
        reason: params.input.correctionReason,
        actedById: params.userId,
        changes,
      });

      return { ok: true, id: existing.id };
    } catch (error) {
      if (isActiveSlotUniqueError(error)) {
        throw error;
      }
      throw error;
    }
      }),
  );
}

export async function archiveAwol(
  db: PrismaClient,
  params: {
    tenantId: string;
    userId: string;
    absenceId: string;
    input: ArchiveAwolInput;
  },
): Promise<AbsenceMutationResult> {
  return db.$transaction(async (tx) => {
    await lockAbsenceRow(tx, params.tenantId, params.absenceId);
    const existing = await tx.absence.findFirst({
      where: { id: params.absenceId, tenantId: params.tenantId },
    });
    if (!existing) {
      throw new AbsenceAccessError();
    }
    if (existing.type !== "AWOL") {
      return { ok: false, error: "This record cannot be archived here." };
    }
    if (existing.recordStatus !== "ACTIVE") {
      return { ok: false, error: STALE_WRITE_MESSAGE };
    }
    if (!timestampsMatch(existing.updatedAt, params.input.expectedUpdatedAt)) {
      return { ok: false, error: STALE_WRITE_MESSAGE };
    }

    await tx.absence.update({
      where: { id: existing.id },
      data: {
        recordStatus: "ARCHIVED",
        archivedAt: new Date(),
        archivedById: params.userId,
        archiveReason: params.input.archiveReason,
        updatedById: params.userId,
      },
    });

    await writeAbsenceHistory(tx, {
      tenantId: params.tenantId,
      absenceId: existing.id,
      action: "ARCHIVED",
      reason: params.input.archiveReason,
      actedById: params.userId,
      changes: [
        {
          field: "recordStatus",
          previous: "ACTIVE",
          next: "ARCHIVED",
        },
      ],
    });

    return { ok: true, id: existing.id };
  });
}

export { getAbsenceForTenant };
export { findActiveDuplicateCancellation };

function isSicknessDuplicateError(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }
  const target = uniqueTarget(error);
  return target.some(
    (part) =>
      part.includes("firstWorkingDaySick") ||
      part.includes(
        "Absence_tenantId_staffId_firstWorkingDaySick_active_sickness",
      ),
  );
}

function sicknessConflictResult(
  existingId: string,
): Extract<AbsenceMutationResult, { ok: false }> {
  return {
    ok: false,
    error: DUPLICATE_SICKNESS_MESSAGE,
    fieldErrors: { firstWorkingDaySick: [DUPLICATE_SICKNESS_MESSAGE] },
    existingAbsenceId: existingId,
  };
}

function sicknessPayloadHash(input: {
  staffId: string;
  reportedDate: string;
  firstWorkingDaySick: string;
  sicknessStartedDate: string | null;
  issueSummary: string | null;
  futureFirstWorkingDayConfirmed: boolean;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        staffId: input.staffId,
        reportedDate: input.reportedDate,
        firstWorkingDaySick: input.firstWorkingDaySick,
        sicknessStartedDate: input.sicknessStartedDate,
        issueSummary: input.issueSummary,
        futureFirstWorkingDayConfirmed: input.futureFirstWorkingDayConfirmed,
      }),
    )
    .digest("hex");
}

type ResolvedSicknessWrite =
  | {
      ok: true;
      staff: NonNullable<Awaited<ReturnType<typeof loadLiveStaff>>>;
      reportedDate: Date;
      firstWorkingDaySick: Date;
      sicknessStartedDate: Date | null;
      issueSummary: string | null;
      acknowledgedFirstWorkingDay: string | null;
    }
  | Extract<AbsenceMutationResult, { ok: false }>;

async function resolveSicknessWrite(
  db: DbClient,
  params: {
    tenantId: string;
    input: SicknessInput | CorrectSicknessInput;
    now: Date;
    excludeId?: string;
    requireAdvanceConfirmation: boolean;
  },
): Promise<ResolvedSicknessWrite> {
  if (params.input.type !== "SICKNESS") {
    return { ok: false, error: FORM_CHECK_MESSAGE };
  }

  const staff = await loadLiveStaff(db, params.tenantId, params.input.staffId);
  if (!staff) {
    return {
      ok: false,
      error: FORM_CHECK_MESSAGE,
      fieldErrors: { staffId: ["Select a valid staff member"] },
    };
  }

  let timeZone: string;
  try {
    timeZone = await getTenantTimezone(db, params.tenantId);
  } catch (error) {
    if (error instanceof TenantTimezoneError) {
      return { ok: false, error: error.message, fieldErrors: { timezone: [error.message] } };
    }
    throw error;
  }

  const dates = evaluateSicknessDates({
    reportedDate: params.input.reportedDate,
    firstWorkingDaySick: params.input.firstWorkingDaySick,
    sicknessStartedDate: params.input.sicknessStartedDate,
    futureFirstWorkingDayConfirmed: params.input.futureFirstWorkingDayConfirmed,
    timeZone,
    now: params.now,
    requireAdvanceConfirmation: params.requireAdvanceConfirmation,
  });
  if (!dates.ok) {
    return {
      ok: false,
      error: FORM_CHECK_MESSAGE,
      fieldErrors: { [dates.field]: [dates.message] },
    };
  }

  const duplicate = await findActiveSicknessDuplicate(db, {
    tenantId: params.tenantId,
    staffId: staff.id,
    firstWorkingDaySick: dates.firstWorkingDaySick,
    excludeId: params.excludeId,
  });
  if (duplicate) {
    return sicknessConflictResult(duplicate.id);
  }

  return {
    ok: true,
    staff,
    reportedDate: dates.reportedDate,
    firstWorkingDaySick: dates.firstWorkingDaySick,
    sicknessStartedDate: dates.sicknessStartedDate,
    issueSummary: params.input.issueSummary,
    acknowledgedFirstWorkingDay:
      params.requireAdvanceConfirmation &&
      dates.requiresAdvanceConfirmation &&
      params.input.futureFirstWorkingDayConfirmed
        ? dateString(dates.firstWorkingDaySick)
        : null,
  };
}

async function withSicknessDuplicateMapping(
  db: PrismaClient,
  params: {
    tenantId: string;
    staffId: string;
    firstWorkingDaySick: Date;
    excludeId?: string;
  },
  run: () => Promise<AbsenceMutationResult>,
): Promise<AbsenceMutationResult> {
  try {
    return await run();
  } catch (error) {
    if (!isSicknessDuplicateError(error)) {
      throw error;
    }
    const existing = await findActiveSicknessDuplicate(db, {
      tenantId: params.tenantId,
      staffId: params.staffId,
      firstWorkingDaySick: params.firstWorkingDaySick,
      excludeId: params.excludeId,
    });
    if (existing) {
      return sicknessConflictResult(existing.id);
    }
    return {
      ok: false,
      error: DUPLICATE_SICKNESS_MESSAGE,
      fieldErrors: { firstWorkingDaySick: [DUPLICATE_SICKNESS_MESSAGE] },
    };
  }
}

function sicknessCreatedChanges(params: {
  staffLabel: string;
  reportedDate: Date;
  firstWorkingDaySick: Date;
  sicknessStartedDate: Date | null;
  issueSummary: string | null;
  acknowledgedFirstWorkingDay: string | null;
}) {
  const changes = [
    { field: "staffId", previous: null, next: params.staffLabel },
    {
      field: "reportedDate",
      previous: null,
      next: dateString(params.reportedDate),
    },
    {
      field: "firstWorkingDaySick",
      previous: null,
      next: dateString(params.firstWorkingDaySick),
    },
    {
      field: "sicknessStartedDate",
      previous: null,
      next: params.sicknessStartedDate
        ? dateString(params.sicknessStartedDate)
        : null,
    },
    {
      field: "issueSummary",
      previous: null,
      next: params.issueSummary,
    },
  ];
  if (params.acknowledgedFirstWorkingDay) {
    changes.push({
      field: "futureFirstWorkingDayConfirmed",
      previous: null,
      next: params.acknowledgedFirstWorkingDay,
    });
  }
  return changes;
}

export async function createSickness(
  db: PrismaClient,
  params: {
    tenantId: string;
    userId: string;
    input: SicknessInput;
    now?: Date;
  },
): Promise<AbsenceMutationResult> {
  const now = params.now ?? new Date();
  const payloadHash = sicknessPayloadHash(params.input);
  const firstWorkingDaySick = parseLocalDate(params.input.firstWorkingDaySick);

  return withSicknessDuplicateMapping(
    db,
    {
      tenantId: params.tenantId,
      staffId: params.input.staffId,
      firstWorkingDaySick: firstWorkingDaySick ?? new Date(0),
    },
    () =>
      db.$transaction(async (tx) => {
        await tx.absenceIdempotencyKey.deleteMany({
          where: {
            tenantId: params.tenantId,
            actorId: params.userId,
            operation: SICKNESS_CREATE_IDEMPOTENCY_OPERATION,
            expiresAt: { lt: now },
          },
        });

        const existingKey = await tx.absenceIdempotencyKey.findUnique({
          where: {
            tenantId_actorId_operation_key: {
              tenantId: params.tenantId,
              actorId: params.userId,
              operation: SICKNESS_CREATE_IDEMPOTENCY_OPERATION,
              key: params.input.idempotencyKey,
            },
          },
        });
        if (existingKey) {
          if (existingKey.payloadHash !== payloadHash) {
            return {
              ok: false,
              error: IDEMPOTENCY_REUSE_MESSAGE,
            };
          }
          if (existingKey.absenceId) {
            return { ok: true, id: existingKey.absenceId };
          }
        } else {
          try {
            await tx.absenceIdempotencyKey.create({
              data: {
                tenantId: params.tenantId,
                actorId: params.userId,
                operation: SICKNESS_CREATE_IDEMPOTENCY_OPERATION,
                key: params.input.idempotencyKey,
                payloadHash,
                expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
              },
            });
          } catch (error) {
            if (
              error instanceof Prisma.PrismaClientKnownRequestError &&
              error.code === "P2002"
            ) {
              const raced = await tx.absenceIdempotencyKey.findUnique({
                where: {
                  tenantId_actorId_operation_key: {
                    tenantId: params.tenantId,
                    actorId: params.userId,
                    operation: SICKNESS_CREATE_IDEMPOTENCY_OPERATION,
                    key: params.input.idempotencyKey,
                  },
                },
              });
              if (raced?.payloadHash !== payloadHash) {
                return { ok: false, error: IDEMPOTENCY_REUSE_MESSAGE };
              }
              if (raced?.absenceId) {
                return { ok: true, id: raced.absenceId };
              }
            } else {
              throw error;
            }
          }
        }

        const resolved = await resolveSicknessWrite(tx, {
          tenantId: params.tenantId,
          input: params.input,
          now,
          requireAdvanceConfirmation: true,
        });
        if (!resolved.ok) {
          return resolved;
        }

        try {
          const absence = await tx.absence.create({
            data: {
              tenantId: params.tenantId,
              staffId: resolved.staff.id,
              eventId: null,
              type: "SICKNESS",
              reportedDate: resolved.reportedDate,
              reportedTime: null,
              reason: null,
              notes: null,
              firstWorkingDaySick: resolved.firstWorkingDaySick,
              followUpType: "REVIEW",
              followUpStatus: "PENDING",
              recordStatus: "ACTIVE",
              createdById: params.userId,
              updatedById: params.userId,
            },
          });

          await tx.sicknessDetail.create({
            data: {
              absenceId: absence.id,
              tenantId: params.tenantId,
              firstWorkingDaySick: resolved.firstWorkingDaySick,
              sicknessStartedDate: resolved.sicknessStartedDate,
              sicknessEndedDate: null,
              episodeState: defaultSicknessEpisodeState(),
              issueSummary: resolved.issueSummary,
              ...staffDisplaySnapshot(resolved.staff),
            },
          });

          await writeAbsenceHistory(tx, {
            tenantId: params.tenantId,
            absenceId: absence.id,
            action: "CREATED",
            actedById: params.userId,
            changes: sicknessCreatedChanges({
              staffLabel: staffLabel(resolved.staff),
              reportedDate: resolved.reportedDate,
              firstWorkingDaySick: resolved.firstWorkingDaySick,
              sicknessStartedDate: resolved.sicknessStartedDate,
              issueSummary: resolved.issueSummary,
              acknowledgedFirstWorkingDay: resolved.acknowledgedFirstWorkingDay,
            }),
          });

          await tx.absenceIdempotencyKey.updateMany({
            where: {
              tenantId: params.tenantId,
              actorId: params.userId,
              operation: SICKNESS_CREATE_IDEMPOTENCY_OPERATION,
              key: params.input.idempotencyKey,
            },
            data: { absenceId: absence.id, payloadHash },
          });

          return { ok: true, id: absence.id };
        } catch (error) {
          if (isSicknessDuplicateError(error)) {
            throw error;
          }
          throw error;
        }
      }),
  );
}

export async function correctSickness(
  db: PrismaClient,
  params: {
    tenantId: string;
    userId: string;
    absenceId: string;
    input: CorrectSicknessInput;
    now?: Date;
  },
): Promise<AbsenceMutationResult> {
  const now = params.now ?? new Date();
  const firstWorkingDaySick = parseLocalDate(params.input.firstWorkingDaySick);

  return withSicknessDuplicateMapping(
    db,
    {
      tenantId: params.tenantId,
      staffId: params.input.staffId,
      firstWorkingDaySick: firstWorkingDaySick ?? new Date(0),
      excludeId: params.absenceId,
    },
    () =>
      db.$transaction(async (tx) => {
        await lockAbsenceRow(tx, params.tenantId, params.absenceId);
        const existing = await tx.absence.findFirst({
          where: { id: params.absenceId, tenantId: params.tenantId },
          include: {
            staff: {
              select: {
                firstName: true,
                lastName: true,
                staffIdNumber: true,
              },
            },
            sickness: true,
          },
        });
        if (!existing) {
          throw new AbsenceAccessError();
        }
        if (existing.type !== "SICKNESS" || !existing.sickness) {
          return { ok: false, error: "This record cannot be corrected here." };
        }
        if (existing.recordStatus !== "ACTIVE") {
          return { ok: false, error: ARCHIVED_CANNOT_CORRECT };
        }
        if (!timestampsMatch(existing.updatedAt, params.input.expectedUpdatedAt)) {
          return { ok: false, error: STALE_WRITE_MESSAGE };
        }

        let timeZone: string;
        try {
          timeZone = await getTenantTimezone(tx, params.tenantId);
        } catch (error) {
          if (error instanceof TenantTimezoneError) {
            return {
              ok: false,
              error: error.message,
              fieldErrors: { timezone: [error.message] },
            };
          }
          throw error;
        }
        const todayIso = todayIsoInTimeZone(timeZone, now);
        const requireAdvanceConfirmation = requiresCorrectionAdvanceConfirmation({
          previousFirstWorkingDaySickIso: dateString(
            existing.sickness.firstWorkingDaySick,
          ),
          nextFirstWorkingDaySickIso: params.input.firstWorkingDaySick,
          todayIso,
        });

        const resolved = await resolveSicknessWrite(tx, {
          tenantId: params.tenantId,
          input: params.input,
          now,
          excludeId: existing.id,
          requireAdvanceConfirmation,
        });
        if (!resolved.ok) {
          return resolved;
        }

        const existingEndedIso = existing.sickness.sicknessEndedDate
          ? dateString(existing.sickness.sicknessEndedDate)
          : null;
        const dateConflict = correctionConflictsWithEndedEpisode({
          firstWorkingDaySickIso: dateString(resolved.firstWorkingDaySick),
          sicknessStartedDateIso: resolved.sicknessStartedDate
            ? dateString(resolved.sicknessStartedDate)
            : null,
          episodeState: existing.sickness.episodeState,
          sicknessEndedDateIso: existingEndedIso,
        });
        if (dateConflict) {
          return {
            ok: false,
            error: FORM_CHECK_MESSAGE,
            fieldErrors: { [dateConflict.field]: [dateConflict.message] },
          };
        }

        const previousStaffLabel = staffLabel(existing.staff);
        const nextStaffLabel = staffLabel(resolved.staff);
        const changes = [
          diffValues(previousStaffLabel, nextStaffLabel) && {
            field: "staffId",
            ...diffValues(previousStaffLabel, nextStaffLabel)!,
          },
          diffValues(
            dateString(existing.reportedDate),
            dateString(resolved.reportedDate),
          ) && {
            field: "reportedDate",
            ...diffValues(
              dateString(existing.reportedDate),
              dateString(resolved.reportedDate),
            )!,
          },
          diffValues(
            dateString(existing.sickness.firstWorkingDaySick),
            dateString(resolved.firstWorkingDaySick),
          ) && {
            field: "firstWorkingDaySick",
            ...diffValues(
              dateString(existing.sickness.firstWorkingDaySick),
              dateString(resolved.firstWorkingDaySick),
            )!,
          },
          diffValues(
            existing.sickness.sicknessStartedDate
              ? dateString(existing.sickness.sicknessStartedDate)
              : null,
            resolved.sicknessStartedDate
              ? dateString(resolved.sicknessStartedDate)
              : null,
          ) && {
            field: "sicknessStartedDate",
            ...diffValues(
              existing.sickness.sicknessStartedDate
                ? dateString(existing.sickness.sicknessStartedDate)
                : null,
              resolved.sicknessStartedDate
                ? dateString(resolved.sicknessStartedDate)
                : null,
            )!,
          },
          diffValues(existing.sickness.issueSummary, resolved.issueSummary) && {
            field: "issueSummary",
            ...diffValues(existing.sickness.issueSummary, resolved.issueSummary)!,
          },
        ].filter(
          (
            change,
          ): change is {
            field: string;
            previous: string | null;
            next: string | null;
          } => Boolean(change),
        );

        if (resolved.acknowledgedFirstWorkingDay) {
          changes.push({
            field: "futureFirstWorkingDayConfirmed",
            previous: null,
            next: resolved.acknowledgedFirstWorkingDay,
          });
        }

        if (changes.length === 0) {
          return { ok: false, error: SICKNESS_NO_CHANGE_MESSAGE };
        }

        try {
          await tx.absence.update({
            where: { id: existing.id },
            data: {
              staffId: resolved.staff.id,
              eventId: null,
              reportedDate: resolved.reportedDate,
              reportedTime: null,
              reason: null,
              notes: null,
              firstWorkingDaySick: resolved.firstWorkingDaySick,
              updatedById: params.userId,
              sickness: {
                update: {
                  firstWorkingDaySick: resolved.firstWorkingDaySick,
                  sicknessStartedDate: resolved.sicknessStartedDate,
                  issueSummary: resolved.issueSummary,
                  ...staffDisplaySnapshot(resolved.staff),
                },
              },
            },
          });

          await writeAbsenceHistory(tx, {
            tenantId: params.tenantId,
            absenceId: existing.id,
            action: "CORRECTED",
            reason: params.input.correctionReason,
            actedById: params.userId,
            changes,
          });

          return { ok: true, id: existing.id };
        } catch (error) {
          if (isSicknessDuplicateError(error)) {
            throw error;
          }
          throw error;
        }
      }),
  );
}

export async function archiveSickness(
  db: PrismaClient,
  params: {
    tenantId: string;
    userId: string;
    absenceId: string;
    input: ArchiveSicknessInput;
  },
): Promise<AbsenceMutationResult> {
  return db.$transaction(async (tx) => {
    await lockAbsenceRow(tx, params.tenantId, params.absenceId);
    const existing = await tx.absence.findFirst({
      where: { id: params.absenceId, tenantId: params.tenantId },
    });
    if (!existing) {
      throw new AbsenceAccessError();
    }
    if (existing.type !== "SICKNESS") {
      return { ok: false, error: "This record cannot be archived here." };
    }
    if (existing.recordStatus !== "ACTIVE") {
      return { ok: false, error: STALE_WRITE_MESSAGE };
    }
    if (!timestampsMatch(existing.updatedAt, params.input.expectedUpdatedAt)) {
      return { ok: false, error: STALE_WRITE_MESSAGE };
    }

    await tx.absence.update({
      where: { id: existing.id },
      data: {
        recordStatus: "ARCHIVED",
        archivedAt: new Date(),
        archivedById: params.userId,
        archiveReason: params.input.archiveReason,
        updatedById: params.userId,
      },
    });

    await writeAbsenceHistory(tx, {
      tenantId: params.tenantId,
      absenceId: existing.id,
      action: "ARCHIVED",
      reason: params.input.archiveReason,
      actedById: params.userId,
      changes: [
        {
          field: "recordStatus",
          previous: "ACTIVE",
          next: "ARCHIVED",
        },
      ],
    });

    return { ok: true, id: existing.id };
  });
}

function sicknessEpisodePayloadHash(params: {
  absenceId: string;
  episodeState: string;
  sicknessEndedDate: string | null;
  correctionReason: string | null;
  confirmClearEndDate: boolean;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        absenceId: params.absenceId,
        episodeState: params.episodeState,
        sicknessEndedDate: params.sicknessEndedDate,
        correctionReason: params.correctionReason,
        confirmClearEndDate: params.confirmClearEndDate,
      }),
    )
    .digest("hex");
}

export async function updateSicknessEpisode(
  db: PrismaClient,
  params: {
    tenantId: string;
    userId: string;
    absenceId: string;
    input: UpdateSicknessEpisodeInput;
    now?: Date;
  },
): Promise<AbsenceMutationResult> {
  const now = params.now ?? new Date();
  const payloadHash = sicknessEpisodePayloadHash({
    absenceId: params.absenceId,
    episodeState: params.input.episodeState,
    sicknessEndedDate: params.input.sicknessEndedDate,
    correctionReason: params.input.correctionReason,
    confirmClearEndDate: params.input.confirmClearEndDate,
  });

  return db.$transaction(async (tx) => {
    await tx.absenceIdempotencyKey.deleteMany({
      where: {
        tenantId: params.tenantId,
        actorId: params.userId,
        operation: SICKNESS_EPISODE_UPDATE_IDEMPOTENCY_OPERATION,
        expiresAt: { lt: now },
      },
    });

    const existingKey = await tx.absenceIdempotencyKey.findUnique({
      where: {
        tenantId_actorId_operation_key: {
          tenantId: params.tenantId,
          actorId: params.userId,
          operation: SICKNESS_EPISODE_UPDATE_IDEMPOTENCY_OPERATION,
          key: params.input.idempotencyKey,
        },
      },
    });
    if (existingKey) {
      if (existingKey.payloadHash !== payloadHash) {
        return { ok: false, error: IDEMPOTENCY_REUSE_MESSAGE };
      }
      if (existingKey.absenceId) {
        return { ok: true, id: existingKey.absenceId };
      }
    } else {
      try {
        await tx.absenceIdempotencyKey.create({
          data: {
            tenantId: params.tenantId,
            actorId: params.userId,
            operation: SICKNESS_EPISODE_UPDATE_IDEMPOTENCY_OPERATION,
            key: params.input.idempotencyKey,
            payloadHash,
            expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          const raced = await tx.absenceIdempotencyKey.findUnique({
            where: {
              tenantId_actorId_operation_key: {
                tenantId: params.tenantId,
                actorId: params.userId,
                operation: SICKNESS_EPISODE_UPDATE_IDEMPOTENCY_OPERATION,
                key: params.input.idempotencyKey,
              },
            },
          });
          if (raced?.payloadHash !== payloadHash) {
            return { ok: false, error: IDEMPOTENCY_REUSE_MESSAGE };
          }
          if (raced?.absenceId) {
            return { ok: true, id: raced.absenceId };
          }
        } else {
          throw error;
        }
      }
    }

    await lockAbsenceRow(tx, params.tenantId, params.absenceId);
    const existing = await tx.absence.findFirst({
      where: { id: params.absenceId, tenantId: params.tenantId },
      include: { sickness: true },
    });
    if (!existing) {
      throw new AbsenceAccessError();
    }
    if (existing.type !== "SICKNESS" || !existing.sickness) {
      return { ok: false, error: "This record cannot be updated here." };
    }
    if (existing.recordStatus !== "ACTIVE") {
      return { ok: false, error: SICKNESS_ARCHIVED_CANNOT_UPDATE };
    }
    if (!timestampsMatch(existing.updatedAt, params.input.expectedUpdatedAt)) {
      return { ok: false, error: STALE_WRITE_MESSAGE };
    }

    let timeZone: string;
    try {
      timeZone = await getTenantTimezone(tx, params.tenantId);
    } catch (error) {
      if (error instanceof TenantTimezoneError) {
        return {
          ok: false,
          error: error.message,
          fieldErrors: { timezone: [error.message] },
        };
      }
      throw error;
    }

    const currentEndedDateIso = existing.sickness.sicknessEndedDate
      ? dateString(existing.sickness.sicknessEndedDate)
      : null;
    const resolved = evaluateSicknessEpisodeUpdate({
      currentState: existing.sickness.episodeState,
      currentEndedDateIso,
      nextState: params.input.episodeState,
      nextEndedDateIso: params.input.sicknessEndedDate,
      firstWorkingDaySick: dateString(existing.sickness.firstWorkingDaySick),
      sicknessStartedDate: existing.sickness.sicknessStartedDate
        ? dateString(existing.sickness.sicknessStartedDate)
        : null,
      correctionReason: params.input.correctionReason,
      confirmClearEndDate: params.input.confirmClearEndDate,
      timeZone,
      now,
    });
    if (!resolved.ok) {
      return {
        ok: false,
        error:
          resolved.field === "form" ? resolved.message : FORM_CHECK_MESSAGE,
        fieldErrors:
          resolved.field === "form"
            ? undefined
            : { [resolved.field]: [resolved.message] },
      };
    }

    const nextEndedDateIso = resolved.sicknessEndedDate
      ? dateString(resolved.sicknessEndedDate)
      : null;

    await tx.absence.update({
      where: { id: existing.id },
      data: {
        updatedById: params.userId,
        sickness: {
          update: {
            episodeState: resolved.episodeState,
            sicknessEndedDate: resolved.sicknessEndedDate,
          },
        },
      },
    });

    await writeAbsenceHistory(tx, {
      tenantId: params.tenantId,
      absenceId: existing.id,
      action: "EPISODE_UPDATED",
      reason: resolved.requiresCorrectionReason
        ? params.input.correctionReason
        : null,
      actedById: params.userId,
      changes: sicknessEpisodeHistoryChanges({
        previousState: existing.sickness.episodeState,
        nextState: resolved.episodeState,
        previousEndedDateIso: currentEndedDateIso,
        nextEndedDateIso,
      }),
    });

    await tx.absenceIdempotencyKey.updateMany({
      where: {
        tenantId: params.tenantId,
        actorId: params.userId,
        operation: SICKNESS_EPISODE_UPDATE_IDEMPOTENCY_OPERATION,
        key: params.input.idempotencyKey,
      },
      data: { absenceId: existing.id, payloadHash },
    });

    return { ok: true, id: existing.id };
  });
}
