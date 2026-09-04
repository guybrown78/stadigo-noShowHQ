import {
  Prisma,
  type PrismaClient,
} from "@prisma/client";
import { FORM_CHECK_MESSAGE } from "@/lib/form";
import { AbsenceAccessError } from "@/lib/absence/errors";
import { diffValues, writeAbsenceHistory } from "@/lib/absence/history";
import { calculateNotice } from "@/lib/absence/notice";
import {
  findActiveDuplicateCancellation,
  getAbsenceForTenant,
} from "@/lib/absence/queries";
import type {
  ArchiveCancellationInput,
  CancellationInput,
  CorrectCancellationInput,
} from "@/lib/absence/schema";
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

const DUPLICATE_MESSAGE =
  "An active Cancellation already exists for this staff member and event.";

type LoadedEvent = {
  id: string;
  name: string;
  eventDate: Date;
  startTime: string | null;
  venueId: string;
  venue: { name: string };
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

function isDuplicateCancellationError(error: unknown): boolean {
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
      part.includes("Absence_tenantId_staffId_eventId_type_active"),
  );
}

function duplicateResult(existingId: string): Extract<AbsenceMutationResult, { ok: false }> {
  return {
    ok: false,
    error: DUPLICATE_MESSAGE,
    fieldErrors: { eventId: [DUPLICATE_MESSAGE] },
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
      eventDate: true,
      startTime: true,
      venueId: true,
      venue: { select: { name: true } },
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

function eventLabel(event: LoadedEvent): string {
  return `${event.name} (${dateString(event.eventDate)})`;
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

  const duplicate = await findActiveDuplicateCancellation(db, {
    tenantId: params.tenantId,
    staffId: staff.id,
    eventId: event.id,
    excludeId: params.excludeId,
  });
  if (duplicate) {
    return duplicateResult(duplicate.id);
  }

  return { ok: true, staff, event, reportedDate, notice };
}

function cancellationSnapshot(event: LoadedEvent, notice: ReturnType<typeof calculateNotice>) {
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

export async function createCancellation(
  db: PrismaClient,
  params: {
    tenantId: string;
    userId: string;
    input: CancellationInput;
  },
): Promise<AbsenceMutationResult> {
  return db.$transaction(async (tx) => {
    const resolved = await resolveCancellationWrite(tx, {
      tenantId: params.tenantId,
      input: params.input,
    });
    if (!resolved.ok) {
      return resolved;
    }

    const snapshot = cancellationSnapshot(resolved.event, resolved.notice);

    try {
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
    } catch (error) {
      if (isDuplicateCancellationError(error)) {
        const existing = await findActiveDuplicateCancellation(tx, {
          tenantId: params.tenantId,
          staffId: resolved.staff.id,
          eventId: resolved.event.id,
        });
        if (existing) {
          return duplicateResult(existing.id);
        }
      }
      throw error;
    }
  });
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
      if (isDuplicateCancellationError(error)) {
        const duplicate = await findActiveDuplicateCancellation(tx, {
          tenantId: params.tenantId,
          staffId: resolved.staff.id,
          eventId: resolved.event.id,
          excludeId: existing.id,
        });
        if (duplicate) {
          return duplicateResult(duplicate.id);
        }
      }
      throw error;
    }
  });
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

export { getAbsenceForTenant };
