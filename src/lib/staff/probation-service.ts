import type {
  Prisma,
  PrismaClient,
  ProbationDurationSource,
  ProbationStatus,
  StaffProbation,
  StaffProbationCycleStatus,
} from "@prisma/client";
import {
  formatLocalDateIso,
  londonTodayIso,
  parseLocalDate,
} from "@/lib/events/dates";
import { DEFAULT_PROBATION_DAYS } from "@/lib/staff/catalog";
import { StaffAccessError } from "@/lib/staff/errors";
import { writeProbationHistory } from "@/lib/staff/history";
import {
  calculatedReviewDueDate,
  resolveProbation,
  type ResolvedProbation,
} from "@/lib/staff/probation";
import type { StaffInput } from "@/lib/staff/schema";
import {
  closeOpenProbationTasks,
  reconcileProbation,
} from "@/lib/staff/tasks";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type ProbationMutationResult =
  | { ok: true; id: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

function cycleToStaffStatus(
  status: StaffProbationCycleStatus,
): ProbationStatus {
  return status;
}

export function staffSummaryFromProbation(probation: {
  status: StaffProbationCycleStatus;
  effectiveDurationDays: number | null;
  durationSource: ProbationDurationSource;
  currentEndDate: Date;
  reviewDueDate: Date;
  completedAt: Date | null;
}) {
  return {
    probationLengthDays: probation.effectiveDurationDays,
    probationEndDate: probation.currentEndDate,
    probationEndDateOverridden:
      probation.durationSource === "MANUAL_END_DATE",
    probationStatus: cycleToStaffStatus(probation.status),
    probationReviewDueDate: probation.completedAt
      ? null
      : probation.reviewDueDate,
  };
}

async function syncStaffSummary(
  db: DbClient,
  params: {
    staffId: string;
    userId: string;
    probation: {
      status: StaffProbationCycleStatus;
      effectiveDurationDays: number | null;
      durationSource: ProbationDurationSource;
      currentEndDate: Date;
      reviewDueDate: Date;
      completedAt: Date | null;
    };
  },
) {
  await db.staff.update({
    where: { id: params.staffId },
    data: {
      ...staffSummaryFromProbation(params.probation),
      updatedById: params.userId,
    },
  });
}

export async function findActiveProbation(
  db: DbClient,
  tenantId: string,
  staffId: string,
): Promise<StaffProbation | null> {
  return db.staffProbation.findFirst({
    where: { tenantId, staffId, completedAt: null },
  });
}

export async function startStaffProbation(
  db: DbClient,
  params: {
    tenantId: string;
    userId: string;
    staffId: string;
    resolved: ResolvedProbation;
  },
): Promise<ProbationMutationResult> {
  if (
    params.resolved.probationStatus === "NOT_APPLICABLE" ||
    !params.resolved.startDate ||
    !params.resolved.probationEndDate ||
    !params.resolved.probationReviewDueDate ||
    !params.resolved.durationSource
  ) {
    return { ok: false, error: "Probation dates are incomplete." };
  }

  const existing = await findActiveProbation(
    db,
    params.tenantId,
    params.staffId,
  );
  if (existing) {
    return {
      ok: false,
      error: "This staff member already has an active probation.",
    };
  }

  const created = await db.staffProbation.create({
    data: {
      tenantId: params.tenantId,
      staffId: params.staffId,
      status: "IN_PROGRESS",
      effectiveDurationDays: params.resolved.effectiveDurationDays,
      durationSource: params.resolved.durationSource,
      startDate: params.resolved.startDate,
      currentEndDate: params.resolved.probationEndDate,
      reviewDueDate: params.resolved.probationReviewDueDate,
      createdById: params.userId,
      updatedById: params.userId,
    },
  });

  await writeProbationHistory(db, {
    tenantId: params.tenantId,
    staffId: params.staffId,
    probationId: created.id,
    action: "STARTED",
    newEndDate: created.currentEndDate,
    newStatus: "IN_PROGRESS",
    actedById: params.userId,
  });

  if (params.resolved.durationSource === "INDIVIDUAL_OVERRIDE") {
    await writeProbationHistory(db, {
      tenantId: params.tenantId,
      staffId: params.staffId,
      probationId: created.id,
      action: "DURATION_OVERRIDDEN",
      newEndDate: created.currentEndDate,
      notes: `Individual duration of ${params.resolved.effectiveDurationDays} days`,
      actedById: params.userId,
    });
  }
  if (params.resolved.durationSource === "MANUAL_END_DATE") {
    await writeProbationHistory(db, {
      tenantId: params.tenantId,
      staffId: params.staffId,
      probationId: created.id,
      action: "END_DATE_OVERRIDDEN",
      newEndDate: created.currentEndDate,
      actedById: params.userId,
    });
  }

  await syncStaffSummary(db, {
    staffId: params.staffId,
    userId: params.userId,
    probation: created,
  });
  await reconcileProbation(db, {
    tenantId: params.tenantId,
    probationId: created.id,
  });

  return { ok: true, id: created.id };
}

async function loadTenantDefaultDays(db: DbClient, tenantId: string) {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { defaultProbationDays: true },
  });
  return tenant?.defaultProbationDays && tenant.defaultProbationDays > 0
    ? tenant.defaultProbationDays
    : DEFAULT_PROBATION_DAYS;
}

export async function resolveStaffProbationInput(
  db: DbClient,
  tenantId: string,
  input: StaffInput,
) {
  const tenantDefaultDays = await loadTenantDefaultDays(db, tenantId);
  return resolveProbation({
    applyProbation: input.applyProbation,
    startDate: input.startDate,
    durationOverride: input.probationLengthDays,
    overrideEndDate: input.overrideProbationEndDate,
    endDateOverride: input.probationEndDate,
    tenantDefaultDays,
  });
}

export async function amendProbationEndDate(
  db: DbClient,
  params: {
    tenantId: string;
    userId: string;
    staffId: string;
    newEndDate: string;
    reason: string;
  },
): Promise<ProbationMutationResult> {
  const reason = params.reason.trim();
  if (!reason) {
    return {
      ok: false,
      error: "Check the form and try again.",
      fieldErrors: { reason: ["Enter a reason for changing the end date"] },
    };
  }
  if (reason.length > 2000) {
    return {
      ok: false,
      error: "Check the form and try again.",
      fieldErrors: { reason: ["Reason must be 2,000 characters or fewer"] },
    };
  }

  const nextEnd = parseLocalDate(params.newEndDate);
  if (!nextEnd) {
    return {
      ok: false,
      error: "Check the form and try again.",
      fieldErrors: { newEndDate: ["Enter a valid probation end date"] },
    };
  }

  const probation = await findActiveProbation(
    db,
    params.tenantId,
    params.staffId,
  );
  if (!probation) {
    throw new StaffAccessError();
  }

  if (formatLocalDateIso(nextEnd) === formatLocalDateIso(probation.currentEndDate)) {
    return {
      ok: false,
      error: "Check the form and try again.",
      fieldErrors: { newEndDate: ["Choose a different end date"] },
    };
  }
  if (nextEnd.getTime() < probation.startDate.getTime()) {
    return {
      ok: false,
      error: "Check the form and try again.",
      fieldErrors: {
        newEndDate: ["Probation end date cannot be before the start date"],
      },
    };
  }

  const previousEnd = probation.currentEndDate;
  const reviewDueDate = calculatedReviewDueDate(nextEnd);
  const updated = await db.staffProbation.update({
    where: { id: probation.id },
    data: {
      currentEndDate: nextEnd,
      reviewDueDate,
      durationSource: "MANUAL_END_DATE",
      updatedById: params.userId,
    },
  });

  await writeProbationHistory(db, {
    tenantId: params.tenantId,
    staffId: params.staffId,
    probationId: probation.id,
    action: "END_DATE_OVERRIDDEN",
    previousEndDate: previousEnd,
    newEndDate: nextEnd,
    notes: reason,
    actedById: params.userId,
  });
  await closeOpenProbationTasks(db, {
    tenantId: params.tenantId,
    probationId: probation.id,
    systemActor: true,
  });
  await syncStaffSummary(db, {
    staffId: params.staffId,
    userId: params.userId,
    probation: updated,
  });
  await reconcileProbation(db, {
    tenantId: params.tenantId,
    probationId: probation.id,
  });

  return { ok: true, id: probation.id };
}

export async function reviewStaffProbation(
  db: DbClient,
  params: {
    tenantId: string;
    userId: string;
    staffId: string;
    outcome: "PASSED" | "EXTENDED" | "NOT_CONTINUED";
    reviewDate: string;
    notes: string | null;
    newEndDate: string | null;
  },
): Promise<ProbationMutationResult> {
  const probation = await findActiveProbation(
    db,
    params.tenantId,
    params.staffId,
  );
  if (!probation) {
    throw new StaffAccessError();
  }

  const reviewDate = parseLocalDate(params.reviewDate);
  if (!reviewDate) {
    return {
      ok: false,
      error: "Check the form and try again.",
      fieldErrors: { reviewDate: ["Enter a valid review date"] },
    };
  }

  const notes = params.notes?.trim() || null;
  if (notes && notes.length > 2000) {
    return {
      ok: false,
      error: "Check the form and try again.",
      fieldErrors: { notes: ["Notes must be 2,000 characters or fewer"] },
    };
  }

  if (params.outcome === "EXTENDED") {
    if (!notes) {
      return {
        ok: false,
        error: "Check the form and try again.",
        fieldErrors: { notes: ["Enter notes explaining the extension"] },
      };
    }
    const nextEnd = params.newEndDate ? parseLocalDate(params.newEndDate) : null;
    if (!nextEnd) {
      return {
        ok: false,
        error: "Check the form and try again.",
        fieldErrors: { newEndDate: ["Enter a new probation end date"] },
      };
    }
    if (formatLocalDateIso(nextEnd) <= formatLocalDateIso(probation.currentEndDate)) {
      return {
        ok: false,
        error: "Check the form and try again.",
        fieldErrors: {
          newEndDate: ["New end date must be after the current end date"],
        },
      };
    }

    const previousEnd = probation.currentEndDate;
    const reviewDueDate = calculatedReviewDueDate(nextEnd);
    const updated = await db.staffProbation.update({
      where: { id: probation.id },
      data: {
        status: "EXTENDED",
        currentEndDate: nextEnd,
        reviewDueDate,
        completedAt: null,
        updatedById: params.userId,
      },
    });
    await writeProbationHistory(db, {
      tenantId: params.tenantId,
      staffId: params.staffId,
      probationId: probation.id,
      action: "EXTENDED",
      previousEndDate: previousEnd,
      newEndDate: nextEnd,
      previousStatus: probation.status,
      newStatus: "EXTENDED",
      notes,
      actedById: params.userId,
    });
    await closeOpenProbationTasks(db, {
      tenantId: params.tenantId,
      probationId: probation.id,
      userId: params.userId,
    });
    await syncStaffSummary(db, {
      staffId: params.staffId,
      userId: params.userId,
      probation: updated,
    });
    await reconcileProbation(db, {
      tenantId: params.tenantId,
      probationId: probation.id,
    });
    return { ok: true, id: probation.id };
  }

  if (params.outcome === "NOT_CONTINUED" && !notes) {
    return {
      ok: false,
      error: "Check the form and try again.",
      fieldErrors: { notes: ["Enter notes for a not-continued decision"] },
    };
  }

  const completedAt = reviewDate;
  const nextStatus: StaffProbationCycleStatus =
    params.outcome === "PASSED" ? "PASSED" : "NOT_CONTINUED";
  const updated = await db.staffProbation.update({
    where: { id: probation.id },
    data: {
      status: nextStatus,
      completedAt,
      updatedById: params.userId,
    },
  });
  await writeProbationHistory(db, {
    tenantId: params.tenantId,
    staffId: params.staffId,
    probationId: probation.id,
    action: nextStatus,
    previousEndDate: probation.currentEndDate,
    newEndDate: probation.currentEndDate,
    previousStatus: probation.status,
    newStatus: nextStatus,
    notes,
    actedById: params.userId,
  });
  await closeOpenProbationTasks(db, {
    tenantId: params.tenantId,
    probationId: probation.id,
    userId: params.userId,
  });
  await syncStaffSummary(db, {
    staffId: params.staffId,
    userId: params.userId,
    probation: updated,
  });
  return { ok: true, id: probation.id };
}

export async function restartStaffProbation(
  db: DbClient,
  params: {
    tenantId: string;
    userId: string;
    staffId: string;
  },
): Promise<ProbationMutationResult> {
  const staff = await db.staff.findFirst({
    where: { id: params.staffId, tenantId: params.tenantId, deletedAt: null },
    select: {
      id: true,
      probations: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { status: true, completedAt: true },
      },
    },
  });
  if (!staff) {
    throw new StaffAccessError();
  }

  const active = await findActiveProbation(db, params.tenantId, params.staffId);
  if (active) {
    return {
      ok: false,
      error: "This staff member already has an active probation.",
    };
  }

  const latest = staff.probations[0];
  if (
    !latest?.completedAt ||
    (latest.status !== "PASSED" && latest.status !== "NOT_CONTINUED")
  ) {
    return {
      ok: false,
      error:
        "A new probation can only be started after Passed or Not continued.",
    };
  }

  const tenantDefaultDays = await loadTenantDefaultDays(db, params.tenantId);
  const resolved = resolveProbation({
    applyProbation: true,
    startDate: londonTodayIso(),
    durationOverride: null,
    overrideEndDate: false,
    endDateOverride: null,
    tenantDefaultDays,
  });
  if (!resolved.ok) {
    return {
      ok: false,
      error: "Probation dates are incomplete.",
      fieldErrors: resolved.fieldErrors,
    };
  }

  return startStaffProbation(db, {
    tenantId: params.tenantId,
    userId: params.userId,
    staffId: params.staffId,
    resolved: resolved.value,
  });
}
