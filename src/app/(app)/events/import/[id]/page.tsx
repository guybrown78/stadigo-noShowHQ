import { notFound, redirect } from "next/navigation";
import { EventImportStatus } from "@prisma/client";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { EventAccessError } from "@/lib/events/errors";
import { getImportSummaryForTenant, importStatusPath } from "@/lib/events/import/queries";

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
    if (
      record.status === EventImportStatus.FAILED &&
      !record.venueConfirmedAt
    ) {
      redirect(`/events/import/${id}/venues`);
    }
    redirect(importStatusPath(record.status, record.id));
  } catch (error) {
    if (error instanceof EventAccessError) {
      notFound();
    }
    throw error;
  }
}
