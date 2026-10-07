import { Prisma, type PrismaClient } from "@prisma/client";
import type { FitNoteStatus } from "@/lib/absence/catalog";
import {
  CHASE_FIT_NOTE_DETAILS,
  CHASE_TASK_COMPLETED_OUTCOME,
  REQUEST_FIT_NOTE_DETAILS,
  REQUEST_TASK_COMPLETED_OUTCOME,
  SYSTEM_CHASE_CANCEL_REASON,
  SYSTEM_REQUEST_CANCEL_REASON,
  chaseDueDateIso,
  evidenceRequirementView,
  requirementDateIso,
  sicknessDayOneIso,
} from "@/lib/absence/evidence-policy";
import { writeAbsenceHistory } from "@/lib/absence/history";
import { getTenantTimezone } from "@/lib/absence/queries";
import { todayIsoInTimeZone } from "@/lib/absence/timezone";
import { formatLocalDateIso, parseLocalDate } from "@/lib/events/dates";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type EvidenceTaskCounts = {
  tasksCreated: number;
  tasksCompleted: number;
  tasksCancelled: number;
};

const EMPTY_COUNTS: EvidenceTaskCounts = {
  tasksCreated: 0,
  tasksCompleted: 0,
  tasksCancelled: 0,
};

export async function loadSicknessEvidenceCounts(
  db: DbClient,
  tenantId: string,
): Promise<{ requiredFromDay: number; chaseAfterDays: number }> {
  const tenant = await db.tenant.findFirst({
    where: { id: tenantId },
    select: {
      fitNoteRequiredFromDay: true,
      fitNoteChaseAfterDays: true,
    },
  });
  if (!tenant) {
    throw new Error("Tenant not found");
  }
  return {
    requiredFromDay: tenant.fitNoteRequiredFromDay,
    chaseAfterDays: tenant.fitNoteChaseAfterDays,
  };
}

export function episodePolicyFields(params: {
  requiredFromDay: number;
  sicknessStartedDateIso: string | null;
  firstWorkingDaySickIso: string;
  now: Date;
}): {
  evidenceRequiredFromDay: number;
  evidenceRequirementDate: Date;
  evidencePolicyCapturedAt: Date;
} {
  const dayOne = sicknessDayOneIso({
    sicknessStartedDateIso: params.sicknessStartedDateIso,
    firstWorkingDaySickIso: params.firstWorkingDaySickIso,
  });
  const requirement = requirementDateIso(dayOne, params.requiredFromDay);
  const requirementDate = requirement ? parseLocalDate(requirement) : null;
  if (!requirementDate) {
    throw new Error("Requirement date could not be calculated");
  }
  return {
    evidenceRequiredFromDay: params.requiredFromDay,
    evidenceRequirementDate: requirementDate,
    evidencePolicyCapturedAt: params.now,
  };
}

export function chaseFieldsForRequested(params: {
  requestedDateIso: string;
  chaseAfterDays: number;
}): { chaseAfterDays: number; chaseDueDate: Date } {
  const due = chaseDueDateIso(params.requestedDateIso, params.chaseAfterDays);
  const chaseDueDate = due ? parseLocalDate(due) : null;
  if (!chaseDueDate) {
    throw new Error("Chase date could not be calculated");
  }
  return { chaseAfterDays: params.chaseAfterDays, chaseDueDate };
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

async function createSystemFollowUp(
  db: DbClient,
  params: {
    tenantId: string;
    absenceId: string;
    purpose: "REQUEST_FIT_NOTE" | "CHASE_FIT_NOTE";
    fitNoteId: string | null;
    dueDate: Date;
    details: string;
  },
): Promise<boolean> {
  const existing = await db.absenceFollowUp.findFirst({
    where: {
      tenantId: params.tenantId,
      absenceId: params.absenceId,
      provenance: "SYSTEM",
      purpose: params.purpose,
      fitNoteId: params.fitNoteId,
    },
    select: { id: true },
  });
  if (existing) {
    return false;
  }
  const row = await db.absenceFollowUp.create({
    data: {
      tenantId: params.tenantId,
      absenceId: params.absenceId,
      state: "OPEN",
      dueDate: params.dueDate,
      details: params.details,
      provenance: "SYSTEM",
      purpose: params.purpose,
      fitNoteId: params.fitNoteId,
      systemActor: true,
      createdById: null,
    },
  });
  await writeAbsenceHistory(db, {
    tenantId: params.tenantId,
    absenceId: params.absenceId,
    action: "FOLLOW_UP_CREATED",
    systemActor: true,
    changes: [
      {
        field: "followUpDueDate",
        previous: null,
        next: formatLocalDateIso(params.dueDate),
      },
      { field: "followUpDetails", previous: null, next: params.details },
      { field: "followUpState", previous: null, next: "OPEN" },
      { field: "followUpProvenance", previous: null, next: "SYSTEM" },
      { field: "followUpPurpose", previous: null, next: params.purpose },
    ],
  });
  return Boolean(row.id);
}

async function transitionSystemFollowUp(
  db: DbClient,
  params: {
    tenantId: string;
    absenceId: string;
    followUpId: string;
    actedById: string | null;
    now: Date;
    next: "COMPLETED" | "CANCELLED";
    completionNotes?: string;
    cancellationReason?: string;
  },
): Promise<boolean> {
  const systemActor = !params.actedById;
  const data =
    params.next === "COMPLETED"
      ? {
          state: "COMPLETED" as const,
          completionNotes: params.completionNotes ?? "",
          completedAt: params.now,
          completedById: params.actedById,
        }
      : {
          state: "CANCELLED" as const,
          cancellationReason: params.cancellationReason ?? "",
          cancelledAt: params.now,
          cancelledById: params.actedById,
        };
  const updated = await db.absenceFollowUp.updateMany({
    where: {
      id: params.followUpId,
      tenantId: params.tenantId,
      state: "OPEN",
      provenance: "SYSTEM",
    },
    data,
  });
  if (updated.count !== 1) {
    return false;
  }
  await writeAbsenceHistory(db, {
    tenantId: params.tenantId,
    absenceId: params.absenceId,
    action:
      params.next === "COMPLETED" ? "FOLLOW_UP_COMPLETED" : "FOLLOW_UP_CANCELLED",
    systemActor,
    actedById: params.actedById,
    reason: params.cancellationReason ?? null,
    changes: [
      { field: "followUpState", previous: "OPEN", next: params.next },
      {
        field:
          params.next === "COMPLETED" ? "followUpOutcome" : "followUpCancellation",
        previous: null,
        next:
          params.next === "COMPLETED"
            ? (params.completionNotes ?? null)
            : (params.cancellationReason ?? null),
      },
    ],
  });
  return true;
}

async function rescheduleOpenFollowUp(
  db: DbClient,
  params: {
    tenantId: string;
    absenceId: string;
    followUpId: string;
    previousDueIso: string;
    nextDueIso: string;
    actedById: string | null;
  },
): Promise<boolean> {
  if (params.previousDueIso === params.nextDueIso) {
    return false;
  }
  const nextDue = parseLocalDate(params.nextDueIso);
  if (!nextDue) {
    return false;
  }
  const updated = await db.absenceFollowUp.updateMany({
    where: {
      id: params.followUpId,
      tenantId: params.tenantId,
      state: "OPEN",
      provenance: "SYSTEM",
    },
    data: { dueDate: nextDue },
  });
  if (updated.count !== 1) {
    return false;
  }
  await writeAbsenceHistory(db, {
    tenantId: params.tenantId,
    absenceId: params.absenceId,
    action: "FOLLOW_UP_UPDATED",
    systemActor: !params.actedById,
    actedById: params.actedById,
    changes: [
      {
        field: "followUpDueDate",
        previous: params.previousDueIso,
        next: params.nextDueIso,
      },
    ],
  });
  return true;
}

export async function evaluateSicknessEvidenceForAbsence(
  db: DbClient,
  params: {
    tenantId: string;
    absenceId: string;
    actedById?: string | null;
    now?: Date;
    todayIso?: string;
  },
): Promise<EvidenceTaskCounts> {
  const now = params.now ?? new Date();
  const actedById = params.actedById ?? null;
  await lockAbsenceRow(db, params.tenantId, params.absenceId);
  const absence = await db.absence.findFirst({
    where: { id: params.absenceId, tenantId: params.tenantId },
    select: {
      id: true,
      type: true,
      recordStatus: true,
      sickness: {
        select: {
          episodeState: true,
          sicknessEndedDate: true,
          evidenceRequiredFromDay: true,
          evidenceRequirementDate: true,
        },
      },
      fitNotes: {
        select: {
          id: true,
          status: true,
          chaseDueDate: true,
        },
      },
      followUps: {
        where: { provenance: "SYSTEM" },
        select: {
          id: true,
          state: true,
          purpose: true,
          fitNoteId: true,
          dueDate: true,
        },
      },
    },
  });
  if (
    !absence ||
    absence.type !== "SICKNESS" ||
    !absence.sickness ||
    absence.recordStatus !== "ACTIVE" ||
    absence.sickness.evidenceRequiredFromDay == null ||
    !absence.sickness.evidenceRequirementDate
  ) {
    return { ...EMPTY_COUNTS };
  }

  let todayIso = params.todayIso;
  if (!todayIso) {
    const timeZone = await getTenantTimezone(db, params.tenantId);
    todayIso = todayIsoInTimeZone(timeZone, now);
  }
  const requirementDate = formatLocalDateIso(
    absence.sickness.evidenceRequirementDate,
  );
  const view = evidenceRequirementView({
    episodeState: absence.sickness.episodeState,
    requiredFromDay: absence.sickness.evidenceRequiredFromDay,
    requirementDate,
    todayIso,
    sicknessEndedDateIso: absence.sickness.sicknessEndedDate
      ? formatLocalDateIso(absence.sickness.sicknessEndedDate)
      : null,
  });
  const counts = { ...EMPTY_COUNTS };
  const hasReceived = absence.fitNotes.some((note) => note.status === "RECEIVED");
  const requested = absence.fitNotes.filter((note) => note.status === "REQUESTED");
  const reached = view.kind === "reached";
  const shouldRequest = reached && !hasReceived && requested.length === 0;
  const requestTasks = absence.followUps.filter(
    (task) => task.purpose === "REQUEST_FIT_NOTE",
  );
  const openRequest = requestTasks.find((task) => task.state === "OPEN");

  if (openRequest && requested.length > 0) {
    if (
      await transitionSystemFollowUp(db, {
        tenantId: params.tenantId,
        absenceId: absence.id,
        followUpId: openRequest.id,
        actedById,
        now,
        next: "COMPLETED",
        completionNotes: REQUEST_TASK_COMPLETED_OUTCOME,
      })
    ) {
      counts.tasksCompleted += 1;
    }
  } else if (openRequest && !shouldRequest) {
    if (
      await transitionSystemFollowUp(db, {
        tenantId: params.tenantId,
        absenceId: absence.id,
        followUpId: openRequest.id,
        actedById,
        now,
        next: "CANCELLED",
        cancellationReason: SYSTEM_REQUEST_CANCEL_REASON,
      })
    ) {
      counts.tasksCancelled += 1;
    }
  } else if (
    openRequest &&
    shouldRequest &&
    formatLocalDateIso(openRequest.dueDate) !== requirementDate
  ) {
    await rescheduleOpenFollowUp(db, {
      tenantId: params.tenantId,
      absenceId: absence.id,
      followUpId: openRequest.id,
      previousDueIso: formatLocalDateIso(openRequest.dueDate),
      nextDueIso: requirementDate,
      actedById,
    });
  } else if (!openRequest && requestTasks.length === 0 && shouldRequest) {
    const due = parseLocalDate(requirementDate);
    if (
      due &&
      (await createSystemFollowUp(db, {
        tenantId: params.tenantId,
        absenceId: absence.id,
        purpose: "REQUEST_FIT_NOTE",
        fitNoteId: null,
        dueDate: due,
        details: REQUEST_FIT_NOTE_DETAILS,
      }))
    ) {
      counts.tasksCreated += 1;
    }
  }

  for (const note of requested) {
    const dueIso = note.chaseDueDate
      ? formatLocalDateIso(note.chaseDueDate)
      : null;
    if (!dueIso) {
      continue;
    }
    const chases = absence.followUps.filter(
      (task) =>
        task.purpose === "CHASE_FIT_NOTE" && task.fitNoteId === note.id,
    );
    const openChase = chases.find((task) => task.state === "OPEN");
    if (chases.length === 0) {
      const due = parseLocalDate(dueIso);
      if (
        due &&
        (await createSystemFollowUp(db, {
          tenantId: params.tenantId,
          absenceId: absence.id,
          purpose: "CHASE_FIT_NOTE",
          fitNoteId: note.id,
          dueDate: due,
          details: CHASE_FIT_NOTE_DETAILS,
        }))
      ) {
        counts.tasksCreated += 1;
      }
      continue;
    }
    if (openChase && formatLocalDateIso(openChase.dueDate) !== dueIso) {
      await rescheduleOpenFollowUp(db, {
        tenantId: params.tenantId,
        absenceId: absence.id,
        followUpId: openChase.id,
        previousDueIso: formatLocalDateIso(openChase.dueDate),
        nextDueIso: dueIso,
        actedById,
      });
    }
  }

  for (const chase of absence.followUps) {
    if (chase.purpose !== "CHASE_FIT_NOTE" || chase.state !== "OPEN" || !chase.fitNoteId) {
      continue;
    }
    const note = absence.fitNotes.find((item) => item.id === chase.fitNoteId);
    if (!note || note.status === "REQUESTED") {
      continue;
    }
    if (note.status === "RECEIVED") {
      if (
        await transitionSystemFollowUp(db, {
          tenantId: params.tenantId,
          absenceId: absence.id,
          followUpId: chase.id,
          actedById,
          now,
          next: "COMPLETED",
          completionNotes: CHASE_TASK_COMPLETED_OUTCOME,
        })
      ) {
        counts.tasksCompleted += 1;
      }
    } else if (
      await transitionSystemFollowUp(db, {
        tenantId: params.tenantId,
        absenceId: absence.id,
        followUpId: chase.id,
        actedById,
        now,
        next: "CANCELLED",
        cancellationReason: SYSTEM_CHASE_CANCEL_REASON,
      })
    ) {
      counts.tasksCancelled += 1;
    }
  }

  return counts;
}

export async function createReplacementEvidenceTask(
  db: PrismaClient,
  params: {
    tenantId: string;
    userId: string;
    absenceId: string;
    purpose: "REQUEST_FIT_NOTE" | "CHASE_FIT_NOTE";
    fitNoteId: string | null;
    now?: Date;
  },
): Promise<
  | { ok: true; followUpId: string; staffId: string }
  | { ok: false; error: string }
> {
  const now = params.now ?? new Date();
  return db.$transaction(async (tx) => {
    await lockAbsenceRow(tx, params.tenantId, params.absenceId);
    const absence = await tx.absence.findFirst({
      where: { id: params.absenceId, tenantId: params.tenantId },
      select: {
        id: true,
        staffId: true,
        type: true,
        recordStatus: true,
        sickness: {
          select: {
            episodeState: true,
            sicknessEndedDate: true,
            evidenceRequiredFromDay: true,
            evidenceRequirementDate: true,
          },
        },
        fitNotes: {
          select: { id: true, status: true, chaseDueDate: true },
        },
        followUps: {
          where: { provenance: "SYSTEM", purpose: params.purpose },
          select: { id: true, state: true, fitNoteId: true },
        },
      },
    });
    if (!absence || absence.type !== "SICKNESS" || !absence.sickness) {
      return { ok: false as const, error: "This record cannot be updated here." };
    }
    if (absence.recordStatus !== "ACTIVE") {
      return { ok: false as const, error: "Archived records cannot be updated." };
    }
    if (
      absence.sickness.evidenceRequiredFromDay == null ||
      !absence.sickness.evidenceRequirementDate
    ) {
      return {
        ok: false as const,
        error: "Fit note timing has not been activated for this sickness.",
      };
    }
    const timeZone = await getTenantTimezone(tx, params.tenantId);
    const todayIso = todayIsoInTimeZone(timeZone, now);
    const requirementDate = formatLocalDateIso(
      absence.sickness.evidenceRequirementDate,
    );
    const view = evidenceRequirementView({
      episodeState: absence.sickness.episodeState,
      requiredFromDay: absence.sickness.evidenceRequiredFromDay,
      requirementDate,
      todayIso,
      sicknessEndedDateIso: absence.sickness.sicknessEndedDate
        ? formatLocalDateIso(absence.sickness.sicknessEndedDate)
        : null,
    });
    const linked = absence.followUps.filter((task) =>
      params.purpose === "CHASE_FIT_NOTE"
        ? task.fitNoteId === params.fitNoteId
        : true,
    );
    const openTask = linked.find((task) => task.state === "OPEN");
    if (openTask) {
      return {
        ok: true as const,
        followUpId: openTask.id,
        staffId: absence.staffId,
      };
    }
    if (!linked.some((task) => task.state !== "OPEN")) {
      return {
        ok: false as const,
        error: "Create a replacement only after the generated follow-up is completed or cancelled.",
      };
    }

    let dueIso: string | null = null;
    let details = REQUEST_FIT_NOTE_DETAILS;
    if (params.purpose === "REQUEST_FIT_NOTE") {
      const hasReceived = absence.fitNotes.some((note) => note.status === "RECEIVED");
      const hasRequested = absence.fitNotes.some((note) => note.status === "REQUESTED");
      if (view.kind !== "reached" || hasReceived || hasRequested) {
        return {
          ok: false as const,
          error: "A replacement request is not needed for this sickness.",
        };
      }
      dueIso = requirementDate;
    } else {
      const note = absence.fitNotes.find((item) => item.id === params.fitNoteId);
      if (!note || note.status !== "REQUESTED" || !note.chaseDueDate) {
        return {
          ok: false as const,
          error: "A replacement chase is only available for an outstanding request.",
        };
      }
      dueIso = formatLocalDateIso(note.chaseDueDate);
      details = CHASE_FIT_NOTE_DETAILS;
    }
    const due = dueIso ? parseLocalDate(dueIso) : null;
    if (!due) {
      return { ok: false as const, error: "The follow-up date could not be calculated." };
    }
    const created = await tx.absenceFollowUp.create({
      data: {
        tenantId: params.tenantId,
        absenceId: absence.id,
        state: "OPEN",
        dueDate: due,
        details,
        provenance: "SYSTEM",
        purpose: params.purpose,
        fitNoteId: params.purpose === "CHASE_FIT_NOTE" ? params.fitNoteId : null,
        systemActor: true,
        createdById: null,
      },
    });
    await writeAbsenceHistory(tx, {
      tenantId: params.tenantId,
      absenceId: absence.id,
      action: "FOLLOW_UP_CREATED",
      actedById: params.userId,
      changes: [
        {
          field: "followUpDueDate",
          previous: null,
          next: formatLocalDateIso(due),
        },
        { field: "followUpDetails", previous: null, next: details },
        { field: "followUpState", previous: null, next: "OPEN" },
        { field: "followUpProvenance", previous: null, next: "SYSTEM" },
        { field: "followUpPurpose", previous: null, next: params.purpose },
        { field: "replacement", previous: null, next: "true" },
      ],
    });
    return {
      ok: true as const,
      followUpId: created.id,
      staffId: absence.staffId,
    };
  });
}

export async function evaluateTenantSicknessEvidence(
  db: PrismaClient,
  tenantId: string,
  now: Date = new Date(),
): Promise<EvidenceTaskCounts & { episodesScanned: number; failed: boolean }> {
  const startedAt = now;
  let episodesScanned = 0;
  const totals = { ...EMPTY_COUNTS };
  let failed = false;
  try {
    const timeZone = await getTenantTimezone(db, tenantId);
    const todayIso = todayIsoInTimeZone(timeZone, now);
    const episodes = await db.sicknessDetail.findMany({
      where: {
        tenantId,
        evidenceRequiredFromDay: { not: null },
        absence: { recordStatus: "ACTIVE", type: "SICKNESS" },
      },
      select: { absenceId: true },
      orderBy: { absenceId: "asc" },
    });
    for (const episode of episodes) {
      episodesScanned += 1;
      try {
        const counts = await db.$transaction((tx) =>
          evaluateSicknessEvidenceForAbsence(tx, {
            tenantId,
            absenceId: episode.absenceId,
            now,
            todayIso,
          }),
        );
        totals.tasksCreated += counts.tasksCreated;
        totals.tasksCompleted += counts.tasksCompleted;
        totals.tasksCancelled += counts.tasksCancelled;
      } catch {
        failed = true;
      }
    }
  } catch {
    failed = true;
  }

  await db.sicknessEvidenceEvaluationRun.create({
    data: {
      tenantId,
      startedAt,
      finishedAt: new Date(),
      status: failed ? "FAILED" : "SUCCESS",
      episodesScanned,
      tasksCreated: totals.tasksCreated,
      tasksCompleted: totals.tasksCompleted,
      tasksCancelled: totals.tasksCancelled,
      errorMessage: failed ? "Sickness evidence evaluation failed." : null,
    },
  });

  return { episodesScanned, failed, ...totals };
}

export function chaseDueIsoForStatus(params: {
  status: FitNoteStatus;
  requestedDateIso: string | null;
  chaseAfterDays: number | null;
}): string | null {
  if (params.status !== "REQUESTED" && params.status !== "RECEIVED") {
    return null;
  }
  if (!params.requestedDateIso || params.chaseAfterDays == null) {
    return null;
  }
  return chaseDueDateIso(params.requestedDateIso, params.chaseAfterDays);
}
