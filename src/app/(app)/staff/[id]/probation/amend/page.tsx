import Link from "next/link";
import { notFound } from "next/navigation";
import { AmendProbationEndForm } from "@/components/staff/amend-probation-form";
import { StaffSectionNav } from "@/components/staff/staff-section-nav";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import {
  formatLocalDateDisplay,
  formatLocalDateIso,
} from "@/lib/events/dates";
import { formatStaffName } from "@/lib/staff/display";
import { StaffAccessError } from "@/lib/staff/errors";
import { currentProbation, getStaffForTenant } from "@/lib/staff/queries";

export const metadata = { title: "Amend probation end date" };

export default async function AmendProbationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireTenant();
  const { id } = await params;
  let staff;
  try {
    staff = await getStaffForTenant(prisma, user.tenantId, id);
  } catch (error) {
    if (error instanceof StaffAccessError) {
      notFound();
    }
    throw error;
  }

  const probation = currentProbation(staff);
  if (!probation || probation.completedAt) {
    notFound();
  }

  const name = formatStaffName(staff);

  return (
    <div>
      <p className="text-sm text-slate-500">
        <Link href="/staff" className="hover:underline">
          Staff
        </Link>
        <span aria-hidden="true"> / </span>
        <Link href={`/staff/${staff.id}`} className="hover:underline">
          {name}
        </Link>
        <span aria-hidden="true"> / </span>
        Amend end date
      </p>
      <StaffSectionNav current="directory" />
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">
        Amend probation end date
      </h1>
      <p className="mt-2 max-w-2xl text-slate-600">
        Change the current agreed end date and record a reason. This is not a
        substitute for recording Passed, Extended, or Not continued.
      </p>
      <p className="mt-4 text-sm text-slate-700">
        Current end date:{" "}
        <span className="font-medium">
          {formatLocalDateDisplay(probation.currentEndDate)}
        </span>
      </p>
      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6">
        <AmendProbationEndForm
          staffId={staff.id}
          currentEndIso={formatLocalDateIso(probation.currentEndDate)}
        />
      </div>
    </div>
  );
}
