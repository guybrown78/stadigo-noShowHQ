import Link from "next/link";
import { Plus } from "lucide-react";
import { DeleteStaffDialog } from "@/components/staff/delete-staff-dialog";
import { StaffRowActions } from "@/components/staff/staff-row-actions";
import { Banner } from "@/components/ui/banner";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, DataTableHead } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar, FilterField } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { Avatar, initialsFor } from "@/components/ui/avatar";
import { filterControlClassName } from "@/components/form";
import {
  EmploymentStatusBadge,
  ProbationLifecycleBadge,
} from "@/components/staff/staff-status-badge";
import { StaffSectionNav } from "@/components/staff/staff-section-nav";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { londonTodayIso } from "@/lib/events/dates";
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
  probationUrgencyCaption,
} from "@/lib/staff/display";
import { deriveProbationLifecycle } from "@/lib/staff/lifecycle";
import {
  listDepartmentsForTenant,
  listStaffForTenant,
} from "@/lib/staff/queries";
import { countOpenProbationTasks, reconcileTenantProbationWork } from "@/lib/staff/tasks";
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

function StaffProbationSummary({
  member,
  todayIso,
}: {
  member: {
    probationStatus: (typeof PROBATION_STATUSES)[number];
    probationEndDate: Date | null;
    probationReviewDueDate: Date | null;
  };
  todayIso: string;
}) {
  if (member.probationStatus === "NOT_APPLICABLE") {
    return <span className="text-slate-500">—</span>;
  }
  const lifecycle = deriveProbationLifecycle({
    status: member.probationStatus,
    completedAt:
      member.probationStatus === "PASSED" ||
      member.probationStatus === "NOT_CONTINUED"
        ? member.probationEndDate
        : null,
    reviewDueDate: member.probationReviewDueDate,
    currentEndDate: member.probationEndDate,
    todayIso,
  });
  if (!lifecycle) return <span className="text-slate-500">—</span>;
  const caption = probationUrgencyCaption(
    lifecycle,
    member.probationReviewDueDate,
    member.probationEndDate,
    todayIso,
  );
  return (
    <div>
      <ProbationLifecycleBadge lifecycle={lifecycle} />
      {caption ? (
        <div className="mt-1 text-xs text-slate-500">{caption}</div>
      ) : null}
    </div>
  );
}

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireTenant();
  await reconcileTenantProbationWork(prisma, user.tenantId);
  const raw = await searchParams;
  const parsedQuery = staffListQuerySchema.safeParse({
    q: first(raw.q),
    employmentStatus: first(raw.employmentStatus),
    department: first(raw.department),
    probationStatus: first(raw.probationStatus),
    probationLifecycle: first(raw.probationLifecycle),
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
        probationLifecycle: "",
        clearanceStatus: "",
        page: 1,
      };

  const [departments, list, openCount] = await Promise.all([
    listDepartmentsForTenant(prisma, user.tenantId),
    listStaffForTenant(prisma, user.tenantId, query),
    countOpenProbationTasks(prisma, user.tenantId),
  ]);

  const todayIso = londonTodayIso();
  const { staff, total, page, pageCount } = list;
  const deleted = first(raw.deleted) === "1";
  const hasFilters = Boolean(
    query.q ||
      query.employmentStatus ||
      query.department ||
      query.probationStatus ||
      query.probationLifecycle ||
      query.clearanceStatus,
  );

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { href: "/dashboard", label: "Dashboard" },
          { label: "Staff" },
        ]}
        title="Staff Directory"
        description="Maintain a reliable staff record for every worker so absences and operational actions can attach to the right person later."
        actions={
          <>
            <ButtonLink href="/staff/import" variant="secondary">
              Import staff
            </ButtonLink>
            <ButtonLink href="/staff/new" icon={Plus}>
              Add staff member
            </ButtonLink>
          </>
        }
      >
        <StaffSectionNav current="directory" probationCount={openCount} />
      </PageHeader>

      {deleted ? (
        <Banner tone="success" className="mt-6">
          Staff member removed from the active directory.
        </Banner>
      ) : null}

      <form method="get" className="mt-4">
        <FilterBar
          ariaLabel="Filter staff"
          active={hasFilters}
          actions={
            <>
              <Button type="submit" size="sm">
                Apply filters
              </Button>
              {hasFilters ? (
                <ButtonLink href="/staff" variant="secondary" size="sm">
                  Reset
                </ButtonLink>
              ) : null}
            </>
          }
        >
        <FilterField label="Search" htmlFor="staff-q" className="min-w-[12rem] flex-[1.3]">
          <input
            id="staff-q"
            name="q"
            type="search"
            defaultValue={query.q}
            placeholder="Staff ID or name"
            className={filterControlClassName()}
          />
        </FilterField>
        <FilterField label="Employment" htmlFor="staff-employment">
          <select
            id="staff-employment"
            name="employmentStatus"
            defaultValue={query.employmentStatus}
            className={filterControlClassName()}
          >
            <option value="">All statuses</option>
            {EMPLOYMENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {EMPLOYMENT_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Department" htmlFor="staff-department">
          <select
            id="staff-department"
            name="department"
            defaultValue={query.department}
            className={filterControlClassName()}
          >
            <option value="">All departments</option>
            {departments.map((department) => (
              <option key={department} value={department}>
                {department}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Probation" htmlFor="staff-probation">
          <select
            id="staff-probation"
            name="probationStatus"
            defaultValue={query.probationStatus}
            className={filterControlClassName()}
          >
            <option value="">All</option>
            {PROBATION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {PROBATION_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Urgency" htmlFor="staff-probation-lifecycle">
          <select
            id="staff-probation-lifecycle"
            name="probationLifecycle"
            defaultValue={query.probationLifecycle}
            className={filterControlClassName()}
          >
            <option value="">All</option>
            <option value="review_due">Review due</option>
            <option value="overdue">Overdue</option>
          </select>
        </FilterField>
        <FilterField label="Clearance" htmlFor="staff-clearance">
          <select
            id="staff-clearance"
            name="clearanceStatus"
            defaultValue={query.clearanceStatus}
            className={filterControlClassName()}
          >
            <option value="">All</option>
            {SECURITY_CLEARANCE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {CLEARANCE_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </FilterField>
        </FilterBar>
      </form>

      {staff.length === 0 ? (
        <EmptyState
          className="mt-6"
          title={hasFilters ? "No staff match these filters" : "No staff yet"}
          description={
            hasFilters
              ? "Try a different search, or clear the filters to see the full directory."
              : "Add your first staff member so absences and operational actions can attach to a reliable record."
          }
          action={
            hasFilters ? (
              <ButtonLink href="/staff" variant="secondary">
                Clear filters
              </ButtonLink>
            ) : (
              <div className="flex flex-wrap justify-center gap-2">
                <ButtonLink href="/staff/new" icon={Plus}>
                  Add your first staff member
                </ButtonLink>
                <ButtonLink href="/staff/import" variant="secondary">
                  Import staff
                </ButtonLink>
              </div>
            )
          }
        />
      ) : (
        <>
          <p className="mt-4 text-sm text-slate-500">
            {total} {total === 1 ? "staff member" : "staff members"}
            {pageCount > 1 ? ` · Page ${page} of ${pageCount}` : ""}
          </p>

          <DataTable className="mt-3 hidden md:block">
              <DataTableHead>
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
              </DataTableHead>
              <tbody>
                {staff.map((member) => (
                  <tr key={member.id} className="border-b border-slate-100">
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-slate-700">
                      {member.staffIdNumber}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/staff/${member.id}`}
                        className="flex items-center gap-3 font-medium text-slate-900 hover:underline"
                      >
                        <Avatar
                          initials={initialsFor(member.firstName, member.lastName)}
                          size="sm"
                        />
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
                      <StaffProbationSummary
                        member={member}
                        todayIso={todayIso}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <StaffRowActions
                        staffId={member.id}
                        staffName={formatStaffName(member)}
                        staffIdNumber={member.staffIdNumber}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
          </DataTable>

          <ul className="mt-3 space-y-3 md:hidden">
            {staff.map((member) => (
              <li key={member.id}>
                <Card className="p-4 shadow-none">
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
                    <StaffProbationSummary
                      member={member}
                      todayIso={todayIso}
                    />
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <ButtonLink href={`/staff/${member.id}`} variant="secondary" size="sm">
                    View
                  </ButtonLink>
                  <ButtonLink href={`/staff/${member.id}/edit`} variant="secondary" size="sm">
                    Edit
                  </ButtonLink>
                  <DeleteStaffDialog
                    staffId={member.id}
                    staffName={formatStaffName(member)}
                    staffIdNumber={member.staffIdNumber}
                  />
                </div>
                </Card>
              </li>
            ))}
          </ul>

          <Pagination
            className="mt-6"
            page={page}
            pageCount={pageCount}
            total={total}
            from={(page - 1) * STAFF_PAGE_SIZE + 1}
            to={Math.min(page * STAFF_PAGE_SIZE, total)}
            itemLabel="staff members"
            hrefForPage={(nextPage) => staffListHref(query, { page: nextPage })}
          />
        </>
      )}
    </div>
  );
}
