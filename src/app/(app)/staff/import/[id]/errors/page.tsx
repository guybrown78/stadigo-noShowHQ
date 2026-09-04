import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { StaffImportStatus } from "@prisma/client";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { CancelStaffImportForm } from "@/components/staff/cancel-staff-import-form";
import { ImportStepper } from "@/components/staff/import-stepper";
import { ImportUploadForm } from "@/components/staff/import-upload-form";
import { StaffAccessError } from "@/lib/staff/errors";
import { RAW_FIELD_HEADER } from "@/lib/staff/import/display";
import {
  getImportForTenant,
  listInvalidImportRows,
  parseFieldErrors,
  parseProbationPreview,
  parseRowRaw,
} from "@/lib/staff/import/queries";
import { importFieldLabel } from "@/lib/staff/import/validate";
import { importErrorsHref } from "@/lib/staff/url";

export const metadata = { title: "Import needs correction" };
export const maxDuration = 60;

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function ImportErrorsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireTenant();
  const { id } = await params;
  const raw = await searchParams;
  const q = first(raw.q);
  const page = Number(first(raw.page) || "1") || 1;
  const repeat = first(raw.repeat) === "1";

  let record;
  try {
    record = await getImportForTenant(prisma, user.tenantId, id);
  } catch (error) {
    if (error instanceof StaffAccessError) {
      notFound();
    }
    throw error;
  }

  if (record.status !== StaffImportStatus.VALIDATION_FAILED) {
    redirect(`/staff/import/${id}`);
  }

  const list = await listInvalidImportRows(prisma, user.tenantId, id, {
    q,
    page,
  });
  const probationCounts = {
    TENANT_DEFAULT: 0,
    INDIVIDUAL_OVERRIDE: 0,
    MANUAL_END_DATE: 0,
  };
  for (const row of record.rows) {
    if (row.status !== "VALID") continue;
    const preview = parseProbationPreview(row.probationPreview);
    if (preview?.applyProbation && preview.durationSource) {
      probationCounts[preview.durationSource] += 1;
    }
  }
  const nonEmptyRows = record.validRows + record.invalidRows;

  return (
    <div>
      <p className="text-sm text-slate-500">
        <Link href="/staff" className="hover:underline">
          Staff
        </Link>
        <span aria-hidden="true"> / </span>
        <Link href="/staff/import" className="hover:underline">
          Import
        </Link>
        <span aria-hidden="true"> / </span>
        Needs correction
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
        This file needs correction
      </h1>
      <p className="mt-2 max-w-2xl text-slate-600">
        No staff, manager relationships, probation records or tasks were
        created. Fix the rows below, then upload the corrected file. Valid rows
        are not imported on their own.
      </p>
      <ImportStepper current="check" />

      {repeat ? (
        <p
          className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          role="status"
        >
          This file matches a previous completed import. Check you are not
          adding the same people twice.
        </p>
      ) : null}

      <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryCard label="Non-empty rows read" value={nonEmptyRows} />
        <SummaryCard label="Valid rows" value={record.validRows} />
        <SummaryCard label="Rows with errors" value={record.invalidRows} />
        <SummaryCard
          label="Duplicate Staff IDs"
          value={list.duplicateStaffIdCount}
        />
        <SummaryCard
          label="Matched existing manager"
          value={record.existingManagerMatchCount}
        />
        <SummaryCard
          label="Manager included in this import"
          value={record.importedManagerMatchCount}
        />
        <SummaryCard
          label="Probation: tenant default"
          value={probationCounts.TENANT_DEFAULT}
        />
        <SummaryCard
          label="Probation: duration override"
          value={probationCounts.INDIVIDUAL_OVERRIDE}
        />
        <SummaryCard
          label="Probation: manual end date"
          value={probationCounts.MANUAL_END_DATE}
        />
      </dl>

      <form
        method="get"
        className="mt-6 rounded-lg border border-slate-200 bg-white p-4"
        aria-label="Search errors"
      >
        <label
          htmlFor="import-error-q"
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          Search errors
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id="import-error-q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Row number, field, or value"
            className="min-w-[16rem] flex-1 rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none ring-slate-400 focus:ring-2"
          />
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Search
          </button>
        </div>
      </form>

      <p className="mt-4 text-sm text-slate-500">
        {list.total} {list.total === 1 ? "row" : "rows"} need correction
        {list.pageCount > 1 ? ` · Page ${list.page} of ${list.pageCount}` : ""}
      </p>

      <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">Row</th>
              <th className="px-4 py-3 font-medium">Staff</th>
              <th className="px-4 py-3 font-medium">Field</th>
              <th className="px-4 py-3 font-medium">Submitted value</th>
              <th className="px-4 py-3 font-medium">What to fix</th>
            </tr>
          </thead>
          <tbody>
            {list.rows.flatMap((row) => {
              const errors = parseFieldErrors(row.fieldErrors);
              const rawRow = parseRowRaw(row.raw);
              const entries = Object.entries(errors);
              const lines: [string, string[]][] =
                entries.length > 0
                  ? entries
                  : [["form", ["This row needs correction"]]];
              const staffLabel =
                [rawRow["Staff ID"], rawRow["First Name"], rawRow["Last Name"]]
                  .filter(Boolean)
                  .join(" ") || "—";
              return lines.map(([field, messages]) => (
                <tr
                  key={`${row.id}-${field}`}
                  className="border-b border-slate-100 align-top"
                >
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                    {row.sourceRowNumber}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{staffLabel}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {importFieldLabel(field)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {displaySubmittedValue(rawRow, field)}
                  </td>
                  <td className="px-4 py-3 text-slate-800">
                    {messages.join(" ")}
                  </td>
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>

      {list.pageCount > 1 ? (
        <div className="mt-4 flex gap-2">
          {list.page > 1 ? (
            <Link
              href={importErrorsHref(id, { q, page: list.page - 1 })}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-50"
            >
              Previous
            </Link>
          ) : null}
          {list.page < list.pageCount ? (
            <Link
              href={importErrorsHref(id, { q, page: list.page + 1 })}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-50"
            >
              Next
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <a
          href={`/staff/import/${id}/errors/download`}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
        >
          Download error report
        </a>
        <CancelStaffImportForm importId={id} />
      </div>

      <section className="mt-8 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">
          Upload a corrected file
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Replace this import with a corrected spreadsheet. The previous check
          will be cancelled.
        </p>
        <div className="mt-4">
          <ImportUploadForm importId={id} compact />
        </div>
      </section>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 text-2xl font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

function displaySubmittedValue(
  raw: ReturnType<typeof parseRowRaw>,
  field: string,
): string {
  const header = RAW_FIELD_HEADER[field];
  if (!header) {
    return "";
  }
  return raw[header] || "—";
}
