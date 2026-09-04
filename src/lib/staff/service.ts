import {
  EmploymentStatus,
  Prisma,
  type PrismaClient,
} from "@prisma/client";
import { parseLocalDate } from "@/lib/events/dates";
import { clearanceStatusRequiresExpiry } from "@/lib/staff/catalog";
import { StaffAccessError } from "@/lib/staff/errors";
import {
  normalizeStaffIdKey,
  normalizeStaffIdNumber,
} from "@/lib/staff/normalize";
import type { ResolvedProbation } from "@/lib/staff/probation";
import {
  findActiveProbation,
  resolveStaffProbationInput,
  startStaffProbation,
} from "@/lib/staff/probation-service";
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

function mandatoryFieldErrors(
  input: StaffInput,
): Record<string, string[]> | undefined {
  const fieldErrors: Record<string, string[]> = {};
  if (!input.staffIdNumber.trim()) {
    fieldErrors.staffIdNumber = ["Staff ID is required"];
  }
  if (!input.firstName.trim()) {
    fieldErrors.firstName = ["First name is required"];
  }
  if (!input.lastName.trim()) {
    fieldErrors.lastName = ["Last name is required"];
  }
  if (input.roleTitle.trim().length < 2) {
    fieldErrors.roleTitle = ["Role must be at least 2 characters"];
  }
  if (
    clearanceStatusRequiresExpiry(input.securityClearanceStatus) &&
    !input.securityClearanceExpiryDate
  ) {
    fieldErrors.securityClearanceExpiryDate = [
      "Enter an expiry date for this clearance status",
    ];
  }
  return Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined;
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

function staffCoreWriteData(input: StaffInput) {
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
    securityClearanceStatus: input.securityClearanceStatus,
    securityClearanceExpiryDate: clearanceStatusRequiresExpiry(
      input.securityClearanceStatus,
    )
      ? clearanceExpiry
      : null,
    notes: input.notes,
  };
}

function staffWriteData(input: StaffInput, probation: ResolvedProbation) {
  return {
    ...staffCoreWriteData(input),
    probationLengthDays: probation.probationLengthDays,
    probationEndDate: probation.probationEndDate,
    probationEndDateOverridden: probation.probationEndDateOverridden,
    probationStatus: probation.probationStatus,
    probationReviewDueDate: probation.probationReviewDueDate,
  };
}

export async function createStaff(
  db: DbClient,
  params: { tenantId: string; userId: string; input: StaffInput },
): Promise<StaffMutationResult> {
  const missing = mandatoryFieldErrors(params.input);
  if (missing) {
    return {
      ok: false,
      error: "Check the form and try again.",
      fieldErrors: missing,
    };
  }

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

  const probation = await resolveStaffProbationInput(
    db,
    params.tenantId,
    params.input,
  );
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

      if (params.input.applyProbation) {
        const started = await startStaffProbation(tx, {
          tenantId: params.tenantId,
          userId: params.userId,
          staffId: staff.id,
          resolved: probation.value,
        });
        if (!started.ok) {
          throw new Error(started.error);
        }
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
    },
  });
  if (!existing) {
    throw new StaffAccessError();
  }

  const missing = mandatoryFieldErrors(params.input);
  if (missing) {
    return {
      ok: false,
      error: "Check the form and try again.",
      fieldErrors: missing,
    };
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

  const active = await findActiveProbation(db, params.tenantId, existing.id);
  if (active && !params.input.applyProbation) {
    return {
      ok: false,
      error: "Check the form and try again.",
      fieldErrors: {
        applyProbation: [
          "Use Review probation to record Passed, Extended, or Not continued",
        ],
      },
    };
  }

  const shouldStart =
    !active &&
    params.input.applyProbation &&
    existing.probationStatus === "NOT_APPLICABLE";

  let resolved: ResolvedProbation | null = null;
  if (shouldStart) {
    const probation = await resolveStaffProbationInput(
      db,
      params.tenantId,
      params.input,
    );
    if (!probation.ok) {
      return {
        ok: false,
        error: "Check the form and try again.",
        fieldErrors: probation.fieldErrors,
      };
    }
    resolved = probation.value;
  }

  try {
    await inTransaction(db, async (tx) => {
      if (shouldStart && resolved) {
        await tx.staff.update({
          where: { id: existing.id },
          data: {
            ...staffWriteData(params.input, resolved),
            updatedById: params.userId,
          },
        });
        const started = await startStaffProbation(tx, {
          tenantId: params.tenantId,
          userId: params.userId,
          staffId: existing.id,
          resolved,
        });
        if (!started.ok) {
          throw new Error(started.error);
        }
        return;
      }

      await tx.staff.update({
        where: { id: existing.id },
        data: {
          ...staffCoreWriteData(params.input),
          updatedById: params.userId,
        },
      });
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

export async function linkStaffManager(
  db: DbClient,
  params: {
    tenantId: string;
    userId: string;
    staffId: string;
    managerStaffId: string;
  },
): Promise<StaffMutationResult> {
  const existing = await db.staff.findFirst({
    where: {
      id: params.staffId,
      tenantId: params.tenantId,
      deletedAt: null,
    },
    select: { id: true, managerStaffId: true },
  });
  if (!existing) {
    throw new StaffAccessError();
  }

  const manager = await assertManager(db, {
    tenantId: params.tenantId,
    staffId: existing.id,
    managerStaffId: params.managerStaffId,
    currentManagerStaffId: existing.managerStaffId,
  });
  if (!manager.ok) {
    return {
      ok: false,
      error: "Check the form and try again.",
      fieldErrors: manager.fieldErrors,
    };
  }

  await db.staff.update({
    where: { id: existing.id },
    data: {
      managerStaffId: params.managerStaffId,
      updatedById: params.userId,
    },
  });

  return { ok: true, id: existing.id };
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
