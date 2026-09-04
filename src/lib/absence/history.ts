import type { AbsenceHistoryAction, Prisma, PrismaClient } from "@prisma/client";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type AbsenceHistoryChange = {
  field: string;
  previous: string | null;
  next: string | null;
};

export async function writeAbsenceHistory(
  db: DbClient,
  params: {
    tenantId: string;
    absenceId: string;
    action: AbsenceHistoryAction;
    reason?: string | null;
    changes?: AbsenceHistoryChange[];
    actedById: string;
  },
) {
  await db.absenceHistory.create({
    data: {
      tenantId: params.tenantId,
      absenceId: params.absenceId,
      action: params.action,
      reason: params.reason ?? null,
      changes: params.changes ?? [],
      actedById: params.actedById,
    },
  });
}

export function parseHistoryChanges(value: unknown): AbsenceHistoryChange[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    if (
      !entry ||
      typeof entry !== "object" ||
      !("field" in entry) ||
      typeof entry.field !== "string"
    ) {
      return [];
    }
    const previous =
      "previous" in entry && (entry.previous === null || typeof entry.previous === "string")
        ? entry.previous
        : null;
    const next =
      "next" in entry && (entry.next === null || typeof entry.next === "string")
        ? entry.next
        : null;
    return [{ field: entry.field, previous, next }];
  });
}

export function diffValues(
  previous: string | null | undefined,
  next: string | null | undefined,
): { previous: string | null; next: string | null } | null {
  const left = previous ?? null;
  const right = next ?? null;
  if (left === right) {
    return null;
  }
  return { previous: left, next: right };
}
