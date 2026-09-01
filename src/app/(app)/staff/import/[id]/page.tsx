import { notFound, redirect } from "next/navigation";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { StaffAccessError } from "@/lib/staff/errors";
import { getImportSummaryForTenant, importStatusPath } from "@/lib/staff/import/queries";

export const maxDuration = 60;

export default async function ImportStatusPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireTenant();
  const { id } = await params;

  try {
    const record = await getImportSummaryForTenant(prisma, user.tenantId, id);
    redirect(importStatusPath(record.status, record.id));
  } catch (error) {
    if (error instanceof StaffAccessError) {
      notFound();
    }
    throw error;
  }
}
