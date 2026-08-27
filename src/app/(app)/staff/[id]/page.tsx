import Link from "next/link";
import { DeleteStaffDialog } from "@/components/staff/delete-staff-dialog";
import {
  ClearanceStatusBadge,
  EmploymentStatusBadge,
  ProbationStatusBadge,
} from "@/components/staff/staff-status-badge";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import {
  formatLocalDateDisplay,
  formatLocalDateIso,
} from "@/lib/events/dates";
import { notFound } from "next/navigation";
import {
  formatStaffName,
  PROBATION_ACTION_LABELS,
} from "@/lib/staff/display";
import { StaffAccessError } from "@/lib/staff/errors";
import { getStaffForTenant } from "@/lib/staff/queries";

export const metadata = { title: "Staff member" };

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-sm font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 text-slate-900">{children}</dd>
    </div>
  );
}

export default async function StaffDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; updated?: string }>;
}) {
  const user = await requireTenant();
  const { id } = await params;
  const flash = await searchParams;

  let staff;
  try {
    staff = await getStaffForTenant(prisma, user.tenantId, id);
  } catch (error) {
    if (error instanceof StaffAccessError) {
      notFound();
    }
    throw error;
  }

  const name = formatStaffName(staff);

  return (
    <div>
      <p className="text-sm text-slate-500">
        <Link href="/staff" className="hover:underline">
          Staff
        </Link>
        <span aria-hidden="true"> / </span>
        {name}
      </p>

      {flash.created === "1" ? (
        <p
          className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
          role="status"
        >
          Staff member created.
        </p>
      ) : null}
      {flash.updated === "1" ? (
        <p
          className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
          role="status"
        >
          Staff member updated.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              {name}
            </h1>
            <EmploymentStatusBadge status={staff.employmentStatus} />
          </div>
          <p className="mt-2 font-mono text-lg text-slate-800">
            Staff ID {staff.staffIdNumber}
          </p>
          <p className="mt-1 text-slate-600">
            {staff.roleTitle}
            {staff.department ? ` · ${staff.department}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/staff/${staff.id}/edit`}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Edit staff member
          </Link>
          <DeleteStaffDialog
            staffId={staff.id}
            staffName={name}
            staffIdNumber={staff.staffIdNumber}
          />
        </div>
      </div>

      <dl className="mt-8 grid gap-6 rounded-lg border border-slate-200 bg-white p-6 sm:grid-cols-2">
        <Detail label="Staff ID">
          <span className="font-mono">{staff.staffIdNumber}</span>
        </Detail>
        <Detail label="Employment status">
          <EmploymentStatusBadge status={staff.employmentStatus} />
        </Detail>
        <Detail label="First name">{staff.firstName}</Detail>
        <Detail label="Last name">{staff.lastName}</Detail>
        <Detail label="Email">{staff.email ?? "—"}</Detail>
        <Detail label="Phone">{staff.phone ?? "—"}</Detail>
        <Detail label="Role">{staff.roleTitle}</Detail>
        <Detail label="Department">{staff.department ?? "—"}</Detail>
        <Detail label="Manager">
          {staff.manager
            ? `${formatStaffName(staff.manager)} (${staff.manager.staffIdNumber})`
            : "—"}
        </Detail>
        <Detail label="Start date">
          {staff.startDate ? (
            <>
              {formatLocalDateDisplay(staff.startDate)}
              <span className="sr-only">
                {" "}
                {formatLocalDateIso(staff.startDate)}
              </span>
            </>
          ) : (
            "—"
          )}
        </Detail>
        <Detail label="Probation status">
          <ProbationStatusBadge status={staff.probationStatus} />
        </Detail>
        <Detail label="Probation end date">
          {staff.probationEndDate
            ? formatLocalDateDisplay(staff.probationEndDate)
            : "—"}
        </Detail>
        <Detail label="Probation duration override">
          {staff.probationLengthDays
            ? `${staff.probationLengthDays} days`
            : "Tenant default"}
        </Detail>
        <Detail label="Probation review due">
          {staff.probationReviewDueDate
            ? formatLocalDateDisplay(staff.probationReviewDueDate)
            : "—"}
        </Detail>
        <Detail label="Security clearance">
          <ClearanceStatusBadge status={staff.securityClearanceStatus} />
        </Detail>
        <Detail label="Clearance expiry">
          {staff.securityClearanceExpiryDate
            ? formatLocalDateDisplay(staff.securityClearanceExpiryDate)
            : "—"}
        </Detail>
        <div className="sm:col-span-2">
          <dt className="text-sm font-medium text-slate-500">Notes</dt>
          <dd className="mt-1 whitespace-pre-wrap text-slate-900">
            {staff.notes ?? "—"}
          </dd>
        </div>
        <Detail label="Created">
          {staff.createdAt.toLocaleString("en-GB")}
        </Detail>
        <Detail label="Last updated">
          {staff.updatedAt.toLocaleString("en-GB")}
        </Detail>
      </dl>

      {staff.probationHistory.length > 0 ? (
        <section className="mt-8 rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-900">
            Probation history
          </h2>
          <ul className="mt-4 divide-y divide-slate-100">
            {staff.probationHistory.map((entry) => (
              <li key={entry.id} className="py-3 text-sm text-slate-700">
                <p className="font-medium text-slate-900">
                  {PROBATION_ACTION_LABELS[entry.action]}
                </p>
                <p className="mt-1 text-slate-600">
                  {entry.createdAt.toLocaleString("en-GB")}
                  {` · ${entry.actedBy.firstName} ${entry.actedBy.lastName}`}
                </p>
                {entry.previousEndDate || entry.newEndDate ? (
                  <p className="mt-1 text-slate-600">
                    End date{" "}
                    {entry.previousEndDate
                      ? formatLocalDateDisplay(entry.previousEndDate)
                      : "none"}{" "}
                    →{" "}
                    {entry.newEndDate
                      ? formatLocalDateDisplay(entry.newEndDate)
                      : "none"}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-8 rounded-lg border border-dashed border-slate-300 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">
          Absence history
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Absence records will attach to this staff member in a later release.
          Nothing is recorded yet.
        </p>
      </section>
    </div>
  );
}
