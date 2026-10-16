import type { AbsenceReasonKind, PrismaClient } from "@prisma/client";

type Db = PrismaClient;

export async function listActiveReasonLabels(
  db: Db,
  tenantId: string,
  kind: AbsenceReasonKind,
): Promise<{ label: string }[]> {
  return db.absenceReason.findMany({
    where: { tenantId, kind, active: true },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    select: { label: true },
  });
}
