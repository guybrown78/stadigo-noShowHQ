import Link from "next/link";
import { notFound } from "next/navigation";
import { StaffForm } from "@/components/staff/staff-form";
import { StaffSectionNav } from "@/components/staff/staff-section-nav";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { formatLocalDateIso } from "@/lib/events/dates";
import { formatStaffName } from "@/lib/staff/display";
import { StaffAccessError } from "@/lib/staff/errors";
import {
  getStaffForTenant,
  getStaffManagerOption,
  getTenantProbationDefault,
} from "@/lib/staff/queries";

export const metadata = { title: "Edit staff member" };

export default async function EditStaffPage({
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

  const [defaultProbationDays, initialManager] = await Promise.all([
    getTenantProbationDefault(prisma, user.tenantId),
    staff.managerStaffId
      ? getStaffManagerOption(prisma, user.tenantId, staff.managerStaffId)
      : Promise.resolve(null),
  ]);
  const active = staff.probations.find((row) => row.completedAt === null);
  const latest = active ?? staff.probations[0] ?? null;
  const probationLock = latest
    ? {
        kind: (active ? "active" : "completed") as "active" | "completed",
        durationSource: latest.durationSource,
        effectiveDurationDays: latest.effectiveDurationDays,
        startDate: formatLocalDateIso(latest.startDate),
        currentEndDate: formatLocalDateIso(latest.currentEndDate),
        reviewDueDate: formatLocalDateIso(latest.reviewDueDate),
      }
    : null;

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
        Edit
      </p>
      <StaffSectionNav current="directory" />
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
        Edit staff member
      </h1>
      <p className="mt-2 max-w-2xl text-slate-600">
        Update operational details. The staff ID stays unique in this
        organisation and this does not create a login.
      </p>
      <div className="mt-8 rounded-lg border border-slate-200 bg-white p-6">
        <StaffForm
          mode="edit"
          staffId={staff.id}
          defaultProbationDays={defaultProbationDays}
          initialManager={initialManager}
          initialValues={{
            staffIdNumber: staff.staffIdNumber,
            firstName: staff.firstName,
            lastName: staff.lastName,
            email: staff.email,
            phone: staff.phone,
            department: staff.department,
            roleTitle: staff.roleTitle,
            managerStaffId: staff.managerStaffId,
            employmentStatus: staff.employmentStatus,
            startDate: staff.startDate
              ? formatLocalDateIso(staff.startDate)
              : "",
            applyProbation: staff.probationStatus !== "NOT_APPLICABLE",
            probationLengthDays: staff.probationLengthDays,
            overrideProbationEndDate: staff.probationEndDateOverridden,
            probationEndDate: staff.probationEndDate
              ? formatLocalDateIso(staff.probationEndDate)
              : "",
            probationStatus: staff.probationStatus,
            securityClearanceStatus: staff.securityClearanceStatus,
            securityClearanceExpiryDate: staff.securityClearanceExpiryDate
              ? formatLocalDateIso(staff.securityClearanceExpiryDate)
              : "",
            notes: staff.notes,
          }}
          probationLock={probationLock}
        />
      </div>
    </div>
  );
}
