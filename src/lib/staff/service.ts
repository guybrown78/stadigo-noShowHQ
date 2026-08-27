import {
  EmploymentStatus,
  Prisma,
  type PrismaClient,
  type StaffProbationAction,
} from "@prisma/client";
import { londonTodayIso, parseLocalDate } from "@/lib/events/dates";
import { StaffAccessError } from "@/lib/staff/errors";
import {
  normalizeStaffIdKey,
  normalizeStaffIdNumber,
} from "@/lib/staff/normalize";
import { resolveProbation, type ResolvedProbation } from "@/lib/staff/probation";
import { getTenantProbationDefault } from "@/lib/staff/queries";
import type { StaffInput } from "@/lib/staff/schema";

export { StaffAccessError };

export type StaffMutationResult =
  | { ok: true; id: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

type DbClient = PrismaClient | Prisma.TransactionClient;

async function inTransaction<T>(
  db: DbClient,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  if ("$transaction" in db) {
    return db.$transaction(fn);
  }
  return fn(db);
}

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

function isDuplicateStaffIdError(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }
  const target = uniqueTarget(error);
  return target.some(
    (part) =>
      part.includes("staffIdNormalized") ||
      part.includes("Staff_tenantId_staffIdNormalized"),
  );
}

async function findDuplicateStaffId(
  db: DbClient,
  tenantId: string,
  staffIdNormalized: string,
  excludeId?: string,
): Promise<boolean> {
  const existing = await db.staff.findFirst({
    where: {
      tenantId,
      staffIdNormalized,
      deletedAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  return Boolean(existing);
}

async function wouldCreateManagerCycle(
  db: DbClient,
  tenantId: string,
  staffId: string,
  managerStaffId: string,
): Promise<boolean> {
  if (staffId === managerStaffId) {
    return true;
  }
  const seen = new Set<string>([staffId]);
  let currentId: string | null = managerStaffId;
  let depth = 0;
  while (currentId && depth < 64) {
    if (seen.has(currentId)) {
      return true;
    }
    seen.add(currentId);
    const row: { managerStaffId: string | null } | null = await db.staff.findFirst({
      where: { id: currentId, tenantId },
      select: { managerStaffId: true },
    });
    currentId = row?.managerStaffId ?? null;
    depth += 1;
  }
  return false;
}

async function assertManager(
  db: DbClient,
  params: {
    tenantId: string;
    staffId?: string;
    managerStaffId: string;
    currentManagerStaffId?: string | null;
  },
): Promise<{ ok: true } | { ok: false; fieldErrors: Record<string, string[]> }> {
  if (params.staffId && params.managerStaffId === params.staffId) {
    return {
      ok: false,
      fieldErrors: { managerStaffId: ["A staff member cannot be their own manager"] },
    };
  }

  const manager = await db.staff.findFirst({
    where: { id: params.managerStaffId, tenantId: params.tenantId },
    select: {
      id: true,
      deletedAt: true,
      employmentStatus: true,
    },
  });

  if (!manager) {
    return {
      ok: false,
      fieldErrors: { managerStaffId: ["Select a valid manager"] },
    };
  }

  const unchanged = params.currentManagerStaffId === params.managerStaffId;

  if (manager.deletedAt && !unchanged) {
    return {
      ok: false,
      fieldErrors: { managerStaffId: ["Select a valid manager"] },
    };
  }

  if (
    !unchanged &&
    manager.employmentStatus !== EmploymentStatus.ACTIVE
  ) {
    return {
      ok: false,
      fieldErrors: {
        managerStaffId: ["Select an active staff member as manager"],
      },
    };
  }

  if (params.staffId) {
    const cyclic = await wouldCreateManagerCycle(
      db,
      params.tenantId,
      params.staffId,
      params.managerStaffId,
    );
    if (cyclic) {
      return {
        ok: false,
        fieldErrors: {
          managerStaffId: ["That manager would create a reporting cycle"],
        },
      };
    }
  }

  return { ok: true };
}

function staffWriteData(input: StaffInput, probation: ResolvedProbation) {
  const startDate = input.startDate ? parseLocalDate(input.startDate) : null;
  const clearanceExpiry = input.securityClearanceExpiryDate
    ? parseLocalDate(input.securityClearanceExpiryDate)
    : null;

  return {
    staffIdNumber: normalizeStaffIdNumber(input.staffIdNumber),
    staffIdNormalized: normalizeStaffIdKey(input.staffIdNumber),
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    phone: input.phone,
    department: input.department,
    roleTitle: input.roleTitle,
    managerStaffId: input.managerStaffId,
    employmentStatus: input.employmentStatus,
    startDate,
    probationLengthDays: probation.probationLengthDays,
    probationEndDate: probation.probationEndDate,
    probationEndDateOverridden: probation.probationEndDateOverridden,
    probationStatus: probation.probationStatus,
    probationReviewDueDate: probation.probationReviewDueDate,
    securityClearanceStatus: input.securityClearanceStatus,
    securityClearanceExpiryDate:
      input.securityClearanceStatus === "VALID" ||
      input.securityClearanceStatus === "EXPIRED"
        ? clearanceExpiry
        : null,
    notes: input.notes,
  };
}

function probationHistoryAction(params: {
  previousStatus: string;
  previousEnd: Date | null;
  previousLength: number | null;
  nextStatus: string;
  nextEnd: Date | null;
  nextLength: number | null;
}): StaffProbationAction | null {
  const hadProbation = params.previousStatus !== "NOT_APPLICABLE";
  const hasProbation = params.nextStatus !== "NOT_APPLICABLE";

  if (!hadProbation && !hasProbation) {
    return null;
  }
  if (!hadProbation && hasProbation) {
    return "STARTED";
  }
  if (params.nextStatus === "PASSED" && params.previousStatus !== "PASSED") {
    return "PASSED";
  }
  if (
    params.nextStatus === "EXTENDED" &&
    params.previousStatus !== "EXTENDED"
  ) {
    return "EXTENDED";
  }

  const endChanged =
    (params.previousEnd?.getTime() ?? null) !==
    (params.nextEnd?.getTime() ?? null);
  const lengthChanged = params.previousLength !== params.nextLength;
  const statusChanged = params.previousStatus !== params.nextStatus;

  if (endChanged) {
    return "END_DATE_OVERRIDDEN";
  }
  if (statusChanged || lengthChanged) {
    return "STATUS_CHANGED";
  }
  return null;
}

export async function createStaff(
  db: DbClient,
  params: { tenantId: string; userId: string; input: StaffInput },
): Promise<StaffMutationResult> {
  const staffIdNormalized = normalizeStaffIdKey(params.input.staffIdNumber);
  if (
    await findDuplicateStaffId(db, params.tenantId, staffIdNormalized)
  ) {
    return {
      ok: false,
      error: "Check the form and try again.",
      fieldErrors: {
        staffIdNumber: ["This staff ID is already used in your organisation"],
      },
    };
  }

  if (params.input.managerStaffId) {
    const manager = await assertManager(db, {
      tenantId: params.tenantId,
      managerStaffId: params.input.managerStaffId,
    });
    if (!manager.ok) {
      return {
        ok: false,
        error: "Check the form and try again.",
        fieldErrors: manager.fieldErrors,
      };
    }
  }

  const tenantDefaultDays = await getTenantProbationDefault(
    db,
    params.tenantId,
  );
  const probation = resolveProbation({
    applyProbation: params.input.applyProbation,
    startDate: params.input.startDate,
    durationOverride: params.input.probationLengthDays,
    overrideEndDate: params.input.overrideProbationEndDate,
    endDateOverride: params.input.probationEndDate,
    requestedStatus: params.input.probationStatus,
    tenantDefaultDays,
    todayIso: londonTodayIso(),
  });
  if (!probation.ok) {
    return {
      ok: false,
      error: "Check the form and try again.",
      fieldErrors: probation.fieldErrors,
    };
  }

  try {
    const created = await inTransaction(db, async (tx) => {
      const staff = await tx.staff.create({
        data: {
          tenantId: params.tenantId,
          ...staffWriteData(params.input, probation.value),
          createdById: params.userId,
          updatedById: params.userId,
        },
        select: { id: true },
      });

      if (probation.value.probationStatus !== "NOT_APPLICABLE") {
        await tx.staffProbationHistory.create({
          data: {
            tenantId: params.tenantId,
            staffId: staff.id,
            action: "STARTED",
            previousEndDate: null,
            newEndDate: probation.value.probationEndDate,
            actedById: params.userId,
          },
        });
      }

      return staff;
    });

    return { ok: true, id: created.id };
  } catch (error) {
    if (isDuplicateStaffIdError(error)) {
      return {
        ok: false,
        error: "Check the form and try again.",
        fieldErrors: {
          staffIdNumber: ["This staff ID is already used in your organisation"],
        },
      };
    }
    return { ok: false, error: "Could not save the staff member. Please try again." };
  }
}

export async function updateStaff(
  db: DbClient,
  params: {
    tenantId: string;
    userId: string;
    staffId: string;
    input: StaffInput;
  },
): Promise<StaffMutationResult> {
  const existing = await db.staff.findFirst({
    where: {
      id: params.staffId,
      tenantId: params.tenantId,
      deletedAt: null,
    },
    select: {
      id: true,
      managerStaffId: true,
      probationStatus: true,
      probationEndDate: true,
      probationLengthDays: true,
    },
  });
  if (!existing) {
    throw new StaffAccessError();
  }

  const staffIdNormalized = normalizeStaffIdKey(params.input.staffIdNumber);
  if (
    await findDuplicateStaffId(
      db,
      params.tenantId,
      staffIdNormalized,
      existing.id,
    )
  ) {
    return {
      ok: false,
      error: "Check the form and try again.",
      fieldErrors: {
        staffIdNumber: ["This staff ID is already used in your organisation"],
      },
    };
  }

  if (params.input.managerStaffId) {
    const manager = await assertManager(db, {
      tenantId: params.tenantId,
      staffId: existing.id,
      managerStaffId: params.input.managerStaffId,
      currentManagerStaffId: existing.managerStaffId,
    });
    if (!manager.ok) {
      return {
        ok: false,
        error: "Check the form and try again.",
        fieldErrors: manager.fieldErrors,
      };
    }
  }

  const tenantDefaultDays = await getTenantProbationDefault(
    db,
    params.tenantId,
  );
  const probation = resolveProbation({
    applyProbation: params.input.applyProbation,
    startDate: params.input.startDate,
    durationOverride: params.input.probationLengthDays,
    overrideEndDate: params.input.overrideProbationEndDate,
    endDateOverride: params.input.probationEndDate,
    requestedStatus: params.input.probationStatus,
    tenantDefaultDays,
    todayIso: londonTodayIso(),
  });
  if (!probation.ok) {
    return {
      ok: false,
      error: "Check the form and try again.",
      fieldErrors: probation.fieldErrors,
    };
  }

  const historyAction = probationHistoryAction({
    previousStatus: existing.probationStatus,
    previousEnd: existing.probationEndDate,
    previousLength: existing.probationLengthDays,
    nextStatus: probation.value.probationStatus,
    nextEnd: probation.value.probationEndDate,
    nextLength: probation.value.probationLengthDays,
  });

  try {
    await inTransaction(db, async (tx) => {
      await tx.staff.update({
        where: { id: existing.id },
        data: {
          ...staffWriteData(params.input, probation.value),
          updatedById: params.userId,
        },
      });

      if (historyAction) {
        await tx.staffProbationHistory.create({
          data: {
            tenantId: params.tenantId,
            staffId: existing.id,
            action: historyAction,
            previousEndDate: existing.probationEndDate,
            newEndDate: probation.value.probationEndDate,
            actedById: params.userId,
          },
        });
      }
    });

    return { ok: true, id: existing.id };
  } catch (error) {
    if (isDuplicateStaffIdError(error)) {
      return {
        ok: false,
        error: "Check the form and try again.",
        fieldErrors: {
          staffIdNumber: ["This staff ID is already used in your organisation"],
        },
      };
    }
    return { ok: false, error: "Could not save the staff member. Please try again." };
  }
}

export async function deleteStaff(
  db: DbClient,
  params: { tenantId: string; userId: string; staffId: string },
): Promise<{ ok: true }> {
  const existing = await db.staff.findFirst({
    where: {
      id: params.staffId,
      tenantId: params.tenantId,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!existing) {
    throw new StaffAccessError();
  }

  await db.staff.update({
    where: { id: existing.id },
    data: {
      deletedAt: new Date(),
      deletedById: params.userId,
      updatedById: params.userId,
    },
  });

  return { ok: true };
}
