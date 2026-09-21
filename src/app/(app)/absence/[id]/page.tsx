import { notFound } from "next/navigation";
import { AbsenceDetailContent } from "@/components/absence/absence-detail-content";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { AbsenceAccessError } from "@/lib/absence/errors";
import { getAbsenceForTenant } from "@/lib/absence/queries";

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

  return <AbsenceDetailContent absence={absence} flash={flash} layout="page" />;
}
