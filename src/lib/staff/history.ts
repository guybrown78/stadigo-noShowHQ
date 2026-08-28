import type {
  PrismaClient,
  Prisma,
  StaffProbationAction,
  StaffProbationCycleStatus,
} from "@prisma/client";

type DbClient = PrismaClient | Prisma.TransactionClient;

export async function writeProbationHistory(
  db: DbClient,
  params: {
    tenantId: string;
    staffId: string;
    probationId: string | null;
    action: StaffProbationAction;
    previousEndDate?: Date | null;
    newEndDate?: Date | null;
    previousStatus?: StaffProbationCycleStatus | null;
    newStatus?: StaffProbationCycleStatus | null;
    notes?: string | null;
    actedById?: string | null;
    systemActor?: boolean;
  },
) {
  await db.staffProbationHistory.create({
    data: {
      tenantId: params.tenantId,
      staffId: params.staffId,
      probationId: params.probationId,
      action: params.action,
      previousEndDate: params.previousEndDate ?? null,
      newEndDate: params.newEndDate ?? null,
      previousStatus: params.previousStatus ?? null,
      newStatus: params.newStatus ?? null,
      notes: params.notes ?? null,
      actedById: params.systemActor ? null : (params.actedById ?? null),
      systemActor: params.systemActor ?? false,
    },
  });
}
