import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { StaffImportStatus } from "@prisma/client";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { StaffAccessError } from "@/lib/staff/errors";
import {
  getImportSummaryForTenant,
  listCreatedImportRows,
  parseRowNormalized,
} from "@/lib/staff/import/queries";
import { importCompleteHref } from "@/lib/staff/url";

export const metadata = { title: "Import complete" };

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function ImportCompletePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireTenant();
  const { id } = await params;
  const rawQuery = await searchParams;
  const page = Number(first(rawQuery.page) || "1") || 1;

  let record;
  try {
    record = await getImportSummaryForTenant(prisma, user.tenantId, id);
  } catch (error) {
    if (error instanceof StaffAccessError) {
      notFound();
    }
    throw error;
  }

  if (record.status !== StaffImportStatus.COMPLETED) {
    redirect(`/staff/import/${id}`);
  }

  const created = await listCreatedImportRows(
    prisma,
    user.tenantId,
    id,
    page,
  );

  return (
    <div>
      <p className="text-sm text-slate-500">
        <Link href="/staff" className="hover:underline">
          Staff
        </Link>
        <span aria-hidden="true"> / </span>
        Import complete
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
        Import complete
      </h1>
      <p className="mt-2 max-w-2xl text-slate-600">
        {record.createdStaffCount}{" "}
        {record.createdStaffCount === 1 ? "staff member was" : "staff members were"}{" "}
        created
        {record.createdProbationCount > 0
          ? ` and ${record.createdProbationCount} ${record.createdProbationCount === 1 ? "probation was" : "probations were"} started`
          : ""}
        . These are new operational staff records only.
      </p>

      <dl className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Staff created
          </dt>
          <dd className="mt-1 text-2xl font-semibold text-slate-900">
            {record.createdStaffCount}
          </dd>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Probation started
          </dt>
          <dd className="mt-1 text-2xl font-semibold text-slate-900">
            {record.createdProbationCount}
          </dd>
        </div>
      </dl>

      <p className="mt-6 text-sm text-slate-500">
        Showing {created.rows.length} of {created.total} imported staff
        {created.pageCount > 1
          ? ` · Page ${created.page} of ${created.pageCount}`
          : ""}
      </p>
      <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">Staff ID</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Record</th>
            </tr>
          </thead>
          <tbody>
            {created.rows.map((row) => {
              const normalized = parseRowNormalized(row.normalized);
              const staff = row.createdStaff;
              return (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">
                    {staff?.staffIdNumber ?? normalized?.staffIdNumber ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {staff
                      ? `${staff.firstName} ${staff.lastName}`
                      : normalized
                        ? `${normalized.firstName} ${normalized.lastName}`
                        : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {staff ? (
                      <Link
                        href={`/staff/${staff.id}`}
                        className="font-medium text-slate-900 hover:underline"
                      >
                        View
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {created.pageCount > 1 ? (
        <div className="mt-4 flex gap-2">
          {created.page > 1 ? (
            <Link
              href={importCompleteHref(id, { page: created.page - 1 })}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-50"
            >
              Previous
            </Link>
          ) : null}
          {created.page < created.pageCount ? (
            <Link
              href={importCompleteHref(id, { page: created.page + 1 })}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-50"
            >
              Next
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/staff"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          View staff directory
        </Link>
        <Link
          href="/staff/import"
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
        >
          Start another import
        </Link>
      </div>
    </div>
  );
}
