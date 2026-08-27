import Link from "next/link";
import { DeleteStaffDialog } from "@/components/staff/delete-staff-dialog";
import {
  EmploymentStatusBadge,
  ProbationStatusBadge,
} from "@/components/staff/staff-status-badge";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { formatLocalDateDisplay } from "@/lib/events/dates";
import {
  EMPLOYMENT_STATUSES,
  PROBATION_STATUSES,
  SECURITY_CLEARANCE_STATUSES,
  STAFF_PAGE_SIZE,
} from "@/lib/staff/catalog";
import {
  CLEARANCE_STATUS_LABELS,
  EMPLOYMENT_STATUS_LABELS,
  formatStaffName,
  PROBATION_STATUS_LABELS,
} from "@/lib/staff/display";
import {
  listDepartmentsForTenant,
  listStaffForTenant,
} from "@/lib/staff/queries";
import {
  staffListQuerySchema,
  type StaffListQuery,
} from "@/lib/staff/schema";
import { staffListHref } from "@/lib/staff/url";

export const metadata = { title: "Staff" };

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireTenant();
  const raw = await searchParams;
  const parsedQuery = staffListQuerySchema.safeParse({
    q: first(raw.q),
    employmentStatus: first(raw.employmentStatus),
    department: first(raw.department),
    probationStatus: first(raw.probationStatus),
    clearanceStatus: first(raw.clearanceStatus),
    page: first(raw.page) || "1",
  });
  const query: StaffListQuery = parsedQuery.success
    ? parsedQuery.data
    : {
        q: "",
        employmentStatus: "",
        department: "",
        probationStatus: "",
        clearanceStatus: "",
        page: 1,
      };

  const [departments, list] = await Promise.all([
    listDepartmentsForTenant(prisma, user.tenantId),
    listStaffForTenant(prisma, user.tenantId, query),
  ]);

  const { staff, total, page, pageCount } = list;
  const deleted = first(raw.deleted) === "1";
  const hasFilters = Boolean(
    query.q ||
      query.employmentStatus ||
      query.department ||
      query.probationStatus ||
      query.clearanceStatus,
  );

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Staff
          </h1>
          <p className="mt-2 max-w-2xl text-slate-600">
            Maintain a reliable staff record for every worker so absences and
            operational actions can attach to the right person later.
          </p>
        </div>
        <Link
          href="/staff/new"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Add staff member
        </Link>
      </div>

      {deleted ? (
        <p
          className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
          role="status"
        >
          Staff member removed from the active directory.
        </p>
      ) : null}

      <form
        method="get"
        className="mt-6 space-y-3 rounded-lg border border-slate-200 bg-white p-4"
        aria-label="Filter staff"
      >
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <div className="lg:col-span-3">
            <label
              htmlFor="staff-q"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Search
            </label>
            <input
              id="staff-q"
              name="q"
              type="search"
              defaultValue={query.q}
              placeholder="Staff ID, first name, or last name"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none ring-slate-400 focus:ring-2"
            />
          </div>
          <div>
            <label
              htmlFor="staff-employment"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Employment status
            </label>
            <select
              id="staff-employment"
              name="employmentStatus"
              defaultValue={query.employmentStatus}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none ring-slate-400 focus:ring-2"
            >
              <option value="">All statuses</option>
              {EMPLOYMENT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {EMPLOYMENT_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="staff-department"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Department
            </label>
            <select
              id="staff-department"
              name="department"
              defaultValue={query.department}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none ring-slate-400 focus:ring-2"
            >
              <option value="">All departments</option>
              {departments.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="staff-probation"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Probation status
            </label>
            <select
              id="staff-probation"
              name="probationStatus"
              defaultValue={query.probationStatus}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none ring-slate-400 focus:ring-2"
            >
              <option value="">All probation statuses</option>
              {PROBATION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {PROBATION_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="staff-clearance"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Security clearance
            </label>
            <select
              id="staff-clearance"
              name="clearanceStatus"
              defaultValue={query.clearanceStatus}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none ring-slate-400 focus:ring-2"
            >
              <option value="">All clearance statuses</option>
              {SECURITY_CLEARANCE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {CLEARANCE_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Apply filters
            </button>
            {hasFilters ? (
              <Link
                href="/staff"
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
              >
                Clear
              </Link>
            ) : null}
          </div>
        </div>
      </form>

      {staff.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          {hasFilters ? (
            <>
              <p className="text-sm font-medium text-slate-800">
                No staff match these filters
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Try a different search, or clear the filters to see the full
                directory.
              </p>
              <Link
                href="/staff"
                className="mt-4 inline-flex rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
              >
                Clear filters
              </Link>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-slate-800">
                No staff yet
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Add your first staff member so absences and operational actions
                can attach to a reliable record.
              </p>
              <Link
                href="/staff/new"
                className="mt-4 inline-flex rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                Add your first staff member
              </Link>
            </>
          )}
        </div>
      ) : (
        <>
          <p className="mt-6 text-sm text-slate-500">
            {total} {total === 1 ? "staff member" : "staff members"}
            {pageCount > 1 ? ` · Page ${page} of ${pageCount}` : ""}
          </p>

          <div className="mt-3 hidden overflow-hidden rounded-lg border border-slate-200 bg-white md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Staff ID</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Department</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Probation</th>
                  <th className="px-4 py-3 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {staff.map((member) => (
                  <tr key={member.id} className="border-b border-slate-100">
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-slate-700">
                      {member.staffIdNumber}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/staff/${member.id}`}
                        className="font-medium text-slate-900 hover:underline"
                      >
                        {formatStaffName(member)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {member.roleTitle}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {member.department ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <EmploymentStatusBadge status={member.employmentStatus} />
                    </td>
                    <td className="px-4 py-3">
                      {member.probationStatus === "NOT_APPLICABLE" ? (
                        <span className="text-slate-500">—</span>
                      ) : (
                        <div>
                          <ProbationStatusBadge
                            status={member.probationStatus}
                          />
                          {member.probationEndDate ? (
                            <div className="mt-1 text-xs text-slate-500">
                              Ends{" "}
                              {formatLocalDateDisplay(member.probationEndDate)}
                            </div>
                          ) : null}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <Link
                          href={`/staff/${member.id}`}
                          className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-800 hover:bg-slate-50"
                        >
                          View
                        </Link>
                        <Link
                          href={`/staff/${member.id}/edit`}
                          className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-800 hover:bg-slate-50"
                        >
                          Edit
                        </Link>
                        <DeleteStaffDialog
                          staffId={member.id}
                          staffName={formatStaffName(member)}
                          staffIdNumber={member.staffIdNumber}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="mt-3 space-y-3 md:hidden">
            {staff.map((member) => (
              <li
                key={member.id}
                className="rounded-lg border border-slate-200 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs font-medium text-slate-500">
                      {member.staffIdNumber}
                    </p>
                    <Link
                      href={`/staff/${member.id}`}
                      className="mt-1 block font-semibold text-slate-900"
                    >
                      {formatStaffName(member)}
                    </Link>
                    <p className="mt-1 text-sm text-slate-600">
                      {member.roleTitle}
                      {member.department ? ` · ${member.department}` : ""}
                    </p>
                  </div>
                  <EmploymentStatusBadge status={member.employmentStatus} />
                </div>
                {member.probationStatus !== "NOT_APPLICABLE" ? (
                  <div className="mt-3">
                    <ProbationStatusBadge status={member.probationStatus} />
                    {member.probationEndDate ? (
                      <p className="mt-1 text-sm text-slate-500">
                        Ends {formatLocalDateDisplay(member.probationEndDate)}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={`/staff/${member.id}`}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
                  >
                    View
                  </Link>
                  <Link
                    href={`/staff/${member.id}/edit`}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
                  >
                    Edit
                  </Link>
                  <DeleteStaffDialog
                    staffId={member.id}
                    staffName={formatStaffName(member)}
                    staffIdNumber={member.staffIdNumber}
                  />
                </div>
              </li>
            ))}
          </ul>

          {pageCount > 1 ? (
            <nav
              className="mt-6 flex items-center justify-between gap-3"
              aria-label="Pagination"
            >
              {page > 1 ? (
                <Link
                  href={staffListHref(query, { page: page - 1 })}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
                >
                  Previous
                </Link>
              ) : (
                <span className="text-sm text-slate-400">Previous</span>
              )}
              <span className="text-sm text-slate-600">
                Showing {(page - 1) * STAFF_PAGE_SIZE + 1}–
                {Math.min(page * STAFF_PAGE_SIZE, total)} of {total}
              </span>
              {page < pageCount ? (
                <Link
                  href={staffListHref(query, { page: page + 1 })}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
                >
                  Next
                </Link>
              ) : (
                <span className="text-sm text-slate-400">Next</span>
              )}
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
