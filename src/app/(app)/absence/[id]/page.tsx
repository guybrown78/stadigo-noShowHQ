import { notFound } from "next/navigation";
import { AbsenceDetailContent } from "@/components/absence/absence-detail-content";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { AbsenceAccessError } from "@/lib/absence/errors";
import { getAbsenceForTenant, getTenantTimezone } from "@/lib/absence/queries";
import { todayIsoInTimeZone } from "@/lib/absence/timezone";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireTenant();
  const { id } = await params;
  try {
    const absence = await getAbsenceForTenant(prisma, user.tenantId, id);
    return {
      title:
        absence.type === "AWOL"
          ? "AWOL"
          : absence.type === "SICKNESS"
            ? "Sickness"
            : "Cancellation",
    };
  } catch {
    return { title: "Absence" };
  }
}

export default async function AbsenceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    created?: string;
    updated?: string;
    archived?: string;
    episodeUpdated?: string;
  }>;
}) {
  const user = await requireTenant();
  const { id } = await params;
  const flash = await searchParams;

  let absence;
  try {
    absence = await getAbsenceForTenant(prisma, user.tenantId, id);
  } catch (error) {
    if (error instanceof AbsenceAccessError) {
      notFound();
    }
    throw error;
  }

  let timeZone: string | undefined;
  let todayIso: string | undefined;
  if (absence.type === "SICKNESS") {
    try {
      timeZone = await getTenantTimezone(prisma, user.tenantId);
      todayIso = todayIsoInTimeZone(timeZone);
    } catch {
      timeZone = undefined;
      todayIso = undefined;
    }
  }

  return (
    <AbsenceDetailContent
      absence={absence}
      flash={flash}
      layout="page"
      timeZone={timeZone}
      todayIso={todayIso}
    />
  );
}
