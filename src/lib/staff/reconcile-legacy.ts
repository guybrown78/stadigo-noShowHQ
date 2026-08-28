import type { PrismaClient, ProbationDurationSource } from "@prisma/client";
import { formatLocalDateIso } from "@/lib/events/dates";
import { writeProbationHistory } from "@/lib/staff/history";
import {
  calculatedReviewDueDate,
  calendarDaysBetween,
} from "@/lib/staff/probation";
import { reconcileTenantProbationWork } from "@/lib/staff/tasks";

function inferDurationSource(staff: {
  probationEndDateOverridden: boolean;
  probationLengthDays: number | null;
}): ProbationDurationSource {
  if (staff.probationEndDateOverridden) {
    return "MANUAL_END_DATE";
  }
  if (staff.probationLengthDays != null) {
    return "INDIVIDUAL_OVERRIDE";
  }
  return "TENANT_DEFAULT";
}

export async function reconcileLegacyProbations(
  db: PrismaClient,
  tenantId?: string,
): Promise<{ created: number; skippedInsufficient: number }> {
  const staffRows = await db.staff.findMany({
    where: {
      ...(tenantId ? { tenantId } : {}),
      deletedAt: null,
      probationStatus: {
        in: ["IN_PROGRESS", "EXTENDED", "PASSED", "NOT_CONTINUED"],
      },
      probations: { none: {} },
    },
    select: {
      id: true,
      tenantId: true,
      startDate: true,
      probationLengthDays: true,
      probationEndDate: true,
      probationEndDateOverridden: true,
      probationStatus: true,
      probationReviewDueDate: true,
      createdById: true,
      updatedById: true,
      updatedAt: true,
    },
  });

  let created = 0;
  let skippedInsufficient = 0;

  for (const staff of staffRows) {
    if (!staff.startDate || !staff.probationEndDate) {
      skippedInsufficient += 1;
      continue;
    }

    const durationSource = inferDurationSource(staff);
    const effectiveDurationDays =
      staff.probationLengthDays ??
      calendarDaysBetween(staff.startDate, staff.probationEndDate);
    const reviewDueDate =
      staff.probationReviewDueDate ??
      calculatedReviewDueDate(staff.probationEndDate);
    const completed =
      staff.probationStatus === "PASSED" ||
      staff.probationStatus === "NOT_CONTINUED";
    const cycleStatus =
      staff.probationStatus === "NOT_APPLICABLE"
        ? "IN_PROGRESS"
        : staff.probationStatus;

    const probation = await db.staffProbation.create({
      data: {
        tenantId: staff.tenantId,
        staffId: staff.id,
        status: cycleStatus,
        effectiveDurationDays,
        durationSource,
        startDate: staff.startDate,
        currentEndDate: staff.probationEndDate,
        reviewDueDate,
        completedAt: completed ? staff.updatedAt : null,
        createdById: staff.createdById,
        updatedById: staff.updatedById,
      },
    });

    await writeProbationHistory(db, {
      tenantId: staff.tenantId,
      staffId: staff.id,
      probationId: probation.id,
      action: "LEGACY_RECONCILED",
      previousEndDate: null,
      newEndDate: staff.probationEndDate,
      newStatus: cycleStatus,
      systemActor: true,
      notes: `Reconciled from staff summary (${durationSource}, ${formatLocalDateIso(staff.startDate)}–${formatLocalDateIso(staff.probationEndDate)})`,
    });
    created += 1;
  }

  const tenantIds = tenantId
    ? [tenantId]
    : [...new Set(staffRows.map((row) => row.tenantId))];
  for (const id of tenantIds) {
    await reconcileTenantProbationWork(db, id);
  }

  return { created, skippedInsufficient };
}

export async function listStaffNeedingProbationDates(
  db: PrismaClient,
  tenantId: string,
) {
  return db.staff.findMany({
    where: {
      tenantId,
      deletedAt: null,
      probationStatus: { in: ["IN_PROGRESS", "EXTENDED"] },
      OR: [{ probationEndDate: null }, { startDate: null }],
    },
    select: {
      id: true,
      staffIdNumber: true,
      firstName: true,
      lastName: true,
      roleTitle: true,
      department: true,
      startDate: true,
      probationEndDate: true,
      probationReviewDueDate: true,
      probationStatus: true,
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
}
