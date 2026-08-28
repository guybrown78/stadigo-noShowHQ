import type { Prisma, PrismaClient } from "@prisma/client";
import {
  DEFAULT_PROBATION_DAYS,
  MAX_PROBATION_DAYS,
} from "@/lib/staff/catalog";
import { StaffAccessError } from "@/lib/staff/errors";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type TenantProbationSettings = {
  defaultProbationDays: number;
  updatedAt: Date | null;
  updatedBy: { firstName: string; lastName: string } | null;
};

export async function getTenantProbationSettings(
  db: DbClient,
  tenantId: string,
): Promise<TenantProbationSettings> {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: {
      defaultProbationDays: true,
      defaultProbationUpdatedAt: true,
      defaultProbationUpdatedBy: {
        select: { firstName: true, lastName: true },
      },
    },
  });
  if (!tenant) {
    throw new StaffAccessError();
  }
  return {
    defaultProbationDays:
      tenant.defaultProbationDays > 0
        ? tenant.defaultProbationDays
        : DEFAULT_PROBATION_DAYS,
    updatedAt: tenant.defaultProbationUpdatedAt,
    updatedBy: tenant.defaultProbationUpdatedBy,
  };
}

export async function updateTenantProbationDefault(
  db: DbClient,
  params: { tenantId: string; userId: string; days: number },
): Promise<
  | { ok: true; defaultProbationDays: number }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> }
> {
  if (
    !Number.isInteger(params.days) ||
    params.days < 1 ||
    params.days > MAX_PROBATION_DAYS
  ) {
    return {
      ok: false,
      error: "Check the form and try again.",
      fieldErrors: {
        defaultProbationDays: [
          `Enter a whole number between 1 and ${MAX_PROBATION_DAYS} days`,
        ],
      },
    };
  }

  const existing = await db.tenant.findUnique({
    where: { id: params.tenantId },
    select: { id: true },
  });
  if (!existing) {
    throw new StaffAccessError();
  }

  const updated = await db.tenant.update({
    where: { id: params.tenantId },
    data: {
      defaultProbationDays: params.days,
      defaultProbationUpdatedAt: new Date(),
      defaultProbationUpdatedById: params.userId,
    },
    select: { defaultProbationDays: true },
  });

  return { ok: true, defaultProbationDays: updated.defaultProbationDays };
}
