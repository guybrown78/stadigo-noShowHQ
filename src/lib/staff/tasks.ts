import type {
  Prisma,
  PrismaClient,
  StaffProbationAction,
  StaffProbationTaskType,
} from "@prisma/client";
import {
  formatLocalDateIso,
  londonTodayIso,
  parseLocalDate,
} from "@/lib/events/dates";
import {
  MAX_PROBATION_SNOOZE_DAYS,
  PROBATION_CHASE_INTERVAL_DAYS,
} from "@/lib/staff/catalog";
import { StaffAccessError } from "@/lib/staff/errors";
import { writeProbationHistory } from "@/lib/staff/history";
import { isUnresolvedCycleStatus } from "@/lib/staff/lifecycle";
import { addCalendarDays } from "@/lib/staff/probation";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type CadenceTaskSpec = {
  type: StaffProbationTaskType;
  dueAt: Date;
  cadenceKey: string;
  historyAction: StaffProbationAction;
};

const ACTIONABLE_TASK_STATES = ["OPEN", "ACKNOWLEDGED", "SNOOZED"] as const;

function specIdentity(spec: Pick<CadenceTaskSpec, "type" | "cadenceKey">) {
  return `${spec.type}:${spec.cadenceKey}`;
}

function overdueEscalationSpec(currentEndDate: Date): CadenceTaskSpec {
  const overdueDay = addCalendarDays(currentEndDate, 1);
  const overdueIso = formatLocalDateIso(overdueDay);
  return {
    type: "OVERDUE_ESCALATION",
    dueAt: overdueDay,
    cadenceKey: `overdue-escalation:${overdueIso}`,
    historyAction: "OVERDUE_ESCALATED",
  };
}

export function expectedTaskSpecs(
  reviewDueDate: Date,
  currentEndDate: Date,
  todayIso: string,
): CadenceTaskSpec[] {
  const specs: CadenceTaskSpec[] = [];
  const reviewIso = formatLocalDateIso(reviewDueDate);
  const endIso = formatLocalDateIso(currentEndDate);

  if (todayIso >= reviewIso) {
    specs.push({
      type: "REVIEW_DUE",
      dueAt: reviewDueDate,
      cadenceKey: `review-due:${reviewIso}`,
      historyAction: "REVIEW_DUE",
    });

    let chase = addCalendarDays(
      reviewDueDate,
      PROBATION_CHASE_INTERVAL_DAYS,
    );
    while (
      formatLocalDateIso(chase) <= endIso &&
      formatLocalDateIso(chase) <= todayIso
    ) {
      const chaseIso = formatLocalDateIso(chase);
      specs.push({
        type: "CHASE",
        dueAt: chase,
        cadenceKey: `chase:${chaseIso}`,
        historyAction: "REMINDER_CREATED",
      });
      chase = addCalendarDays(chase, PROBATION_CHASE_INTERVAL_DAYS);
    }
  }

  const overdue = overdueEscalationSpec(currentEndDate);
  const overdueIso = formatLocalDateIso(overdue.dueAt);
  if (todayIso >= overdueIso) {
    specs.push(overdue);

    let chase = addCalendarDays(overdue.dueAt, PROBATION_CHASE_INTERVAL_DAYS);
    while (formatLocalDateIso(chase) <= todayIso) {
      const chaseIso = formatLocalDateIso(chase);
      specs.push({
        type: "CHASE",
        dueAt: chase,
        cadenceKey: `chase:${chaseIso}`,
        historyAction: "REMINDER_CREATED",
      });
      chase = addCalendarDays(chase, PROBATION_CHASE_INTERVAL_DAYS);
    }
  }

  return specs;
}

export function currentTaskSpec(
  reviewDueDate: Date,
  currentEndDate: Date,
  todayIso: string,
): CadenceTaskSpec | null {
  const overdue = overdueEscalationSpec(currentEndDate);
  if (todayIso >= formatLocalDateIso(overdue.dueAt)) {
    return overdue;
  }
  const specs = expectedTaskSpecs(reviewDueDate, currentEndDate, todayIso);
  return specs.at(-1) ?? null;
}

export async function closeOpenProbationTasks(
  db: DbClient,
  params: {
    tenantId: string;
    probationId: string;
    userId?: string | null;
    systemActor?: boolean;
  },
) {
  await db.staffProbationTask.updateMany({
    where: {
      tenantId: params.tenantId,
      probationId: params.probationId,
      state: { in: ["OPEN", "ACKNOWLEDGED", "SNOOZED"] },
    },
    data: {
      state: params.userId ? "RESOLVED" : "CANCELLED",
      resolvedAt: new Date(),
      resolvedById: params.systemActor ? null : (params.userId ?? null),
    },
  });
}

export async function reconcileProbation(
  db: DbClient,
  params: {
    tenantId: string;
    probationId: string;
    todayIso?: string;
  },
): Promise<number> {
  const todayIso = params.todayIso ?? londonTodayIso();
  const probation = await db.staffProbation.findFirst({
    where: { id: params.probationId, tenantId: params.tenantId },
    select: {
      id: true,
      tenantId: true,
      staffId: true,
      status: true,
      completedAt: true,
      reviewDueDate: true,
      currentEndDate: true,
    },
  });
  if (!probation) {
    throw new StaffAccessError();
  }
  if (!isUnresolvedCycleStatus(probation.status, probation.completedAt)) {
    return 0;
  }

  const specs = expectedTaskSpecs(
    probation.reviewDueDate,
    probation.currentEndDate,
    todayIso,
  );
  const current = currentTaskSpec(
    probation.reviewDueDate,
    probation.currentEndDate,
    todayIso,
  );
  if (!current) {
    await closeOpenProbationTasks(db, {
      tenantId: probation.tenantId,
      probationId: probation.id,
      systemActor: true,
    });
    return 0;
  }

  const existing = await db.staffProbationTask.findMany({
    where: {
      tenantId: probation.tenantId,
      probationId: probation.id,
    },
    select: { id: true, type: true, cadenceKey: true, state: true },
  });
  const seen = new Set(existing.map((row) => specIdentity(row)));
  const currentRow = existing.find(
    (row) => specIdentity(row) === specIdentity(current),
  );

  if (
    currentRow &&
    (currentRow.state === "CANCELLED" || currentRow.state === "RESOLVED")
  ) {
    await db.staffProbationTask.update({
      where: { id: currentRow.id },
      data: {
        state: "OPEN",
        resolvedAt: null,
        resolvedById: null,
      },
    });
  }

  let created = 0;
  for (const spec of specs) {
    if (seen.has(specIdentity(spec))) {
      continue;
    }
    const isCurrent = specIdentity(spec) === specIdentity(current);
    try {
      await db.staffProbationTask.create({
        data: {
          tenantId: probation.tenantId,
          staffId: probation.staffId,
          probationId: probation.id,
          type: spec.type,
          state: isCurrent ? "OPEN" : "CANCELLED",
          dueAt: spec.dueAt,
          cadenceKey: spec.cadenceKey,
          resolvedAt: isCurrent ? null : new Date(),
          systemActor: true,
        },
      });
      await writeProbationHistory(db, {
        tenantId: probation.tenantId,
        staffId: probation.staffId,
        probationId: probation.id,
        action: spec.historyAction,
        systemActor: true,
        notes:
          spec.type === "CHASE"
            ? `In-app chase reminder for ${formatLocalDateIso(spec.dueAt)}`
            : null,
      });
      created += 1;
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as { code?: string }).code === "P2002"
      ) {
        continue;
      }
      throw error;
    }
  }

  await db.staffProbationTask.updateMany({
    where: {
      tenantId: probation.tenantId,
      probationId: probation.id,
      state: { in: [...ACTIONABLE_TASK_STATES] },
      OR: [
        { type: { not: current.type } },
        { cadenceKey: { not: current.cadenceKey } },
      ],
    },
    data: {
      state: "CANCELLED",
      resolvedAt: new Date(),
      resolvedById: null,
    },
  });

  return created;
}

export async function reconcileTenantProbationWork(
  db: PrismaClient,
  tenantId: string,
  todayIso = londonTodayIso(),
): Promise<number> {
  const open = await db.staffProbation.findMany({
    where: {
      tenantId,
      completedAt: null,
      status: { in: ["IN_PROGRESS", "EXTENDED"] },
    },
    select: { id: true },
  });

  let created = 0;
  for (const row of open) {
    created += await reconcileProbation(db, {
      tenantId,
      probationId: row.id,
      todayIso,
    });
  }
  return created;
}

export async function countOpenProbationTasks(
  db: DbClient,
  tenantId: string,
  todayIso = londonTodayIso(),
): Promise<number> {
  const today = parseLocalDate(todayIso);
  if (!today) return 0;

  return db.staffProbation.count({
    where: {
      tenantId,
      completedAt: null,
      tasks: {
        some: {
          state: { in: [...ACTIONABLE_TASK_STATES] },
          dueAt: { lte: today },
          OR: [{ snoozedUntil: null }, { snoozedUntil: { lt: today } }],
        },
      },
    },
  });
}

export async function acknowledgeProbationTask(
  db: DbClient,
  params: { tenantId: string; userId: string; taskId: string },
): Promise<
  | { ok: true }
  | { ok: false; error: string }
> {
  const task = await db.staffProbationTask.findFirst({
    where: { id: params.taskId, tenantId: params.tenantId },
    select: {
      id: true,
      staffId: true,
      probationId: true,
      state: true,
      probation: { select: { completedAt: true } },
    },
  });
  if (!task) {
    throw new StaffAccessError();
  }
  if (task.probation.completedAt || task.state === "RESOLVED" || task.state === "CANCELLED") {
    return { ok: false, error: "This reminder is no longer open." };
  }

  await db.staffProbationTask.update({
    where: { id: task.id },
    data: {
      state: task.state === "SNOOZED" ? "SNOOZED" : "ACKNOWLEDGED",
      acknowledgedAt: new Date(),
      acknowledgedById: params.userId,
    },
  });
  await writeProbationHistory(db, {
    tenantId: params.tenantId,
    staffId: task.staffId,
    probationId: task.probationId,
    action: "REMINDER_ACKNOWLEDGED",
    actedById: params.userId,
  });
  return { ok: true };
}

export async function snoozeProbationTask(
  db: DbClient,
  params: {
    tenantId: string;
    userId: string;
    taskId: string;
    snoozedUntil: string;
    reason: string;
    todayIso?: string;
  },
): Promise<
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> }
> {
  const todayIso = params.todayIso ?? londonTodayIso();
  const until = parseLocalDate(params.snoozedUntil);
  if (!until) {
    return {
      ok: false,
      error: "Check the form and try again.",
      fieldErrors: { snoozedUntil: ["Enter a valid date"] },
    };
  }

  const reason = params.reason.trim();
  if (!reason) {
    return {
      ok: false,
      error: "Check the form and try again.",
      fieldErrors: { reason: ["Enter a reason for snoozing"] },
    };
  }
  if (reason.length > 2000) {
    return {
      ok: false,
      error: "Check the form and try again.",
      fieldErrors: { reason: ["Reason must be 2,000 characters or fewer"] },
    };
  }

  const untilIso = formatLocalDateIso(until);
  const maxUntil = addCalendarDays(
    parseLocalDate(todayIso)!,
    MAX_PROBATION_SNOOZE_DAYS,
  );
  if (untilIso < todayIso) {
    return {
      ok: false,
      error: "Check the form and try again.",
      fieldErrors: { snoozedUntil: ["Snooze date cannot be in the past"] },
    };
  }
  if (untilIso > formatLocalDateIso(maxUntil)) {
    return {
      ok: false,
      error: "Check the form and try again.",
      fieldErrors: {
        snoozedUntil: [
          `Snooze can be at most ${MAX_PROBATION_SNOOZE_DAYS} days`,
        ],
      },
    };
  }

  const task = await db.staffProbationTask.findFirst({
    where: { id: params.taskId, tenantId: params.tenantId },
    select: {
      id: true,
      staffId: true,
      probationId: true,
      state: true,
      probation: {
        select: {
          completedAt: true,
          currentEndDate: true,
          status: true,
        },
      },
    },
  });
  if (!task) {
    throw new StaffAccessError();
  }
  if (
    task.probation.completedAt ||
    task.state === "RESOLVED" ||
    task.state === "CANCELLED"
  ) {
    return { ok: false, error: "This reminder is no longer open." };
  }

  const endIso = formatLocalDateIso(task.probation.currentEndDate);
  if (todayIso > endIso) {
    return {
      ok: false,
      error: "Snoozing is not available after the probation end date.",
      fieldErrors: {
        snoozedUntil: ["Snoozing is not available once probation is overdue"],
      },
    };
  }

  await db.staffProbationTask.update({
    where: { id: task.id },
    data: {
      state: "SNOOZED",
      snoozedUntil: until,
      snoozedById: params.userId,
      snoozeReason: reason,
    },
  });
  await writeProbationHistory(db, {
    tenantId: params.tenantId,
    staffId: task.staffId,
    probationId: task.probationId,
    action: "REMINDER_SNOOZED",
    actedById: params.userId,
    notes: reason,
  });
  return { ok: true };
}
