import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { StaffImportStatus } from "@prisma/client";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { CancelStaffImportForm } from "@/components/staff/cancel-staff-import-form";
import { ConfirmStaffImportForm } from "@/components/staff/confirm-staff-import-form";
import { ImportStepper } from "@/components/staff/import-stepper";
import { DEFAULT_PROBATION_DAYS } from "@/lib/staff/catalog";
import { StaffAccessError } from "@/lib/staff/errors";
import {
  clearanceLabel,
  employmentLabel,
  managerMappingLabel,
  omittedManagerLabel,
  probationSummaryLabel,
} from "@/lib/staff/import/display";
import {
  getImportForTenant,
  importStatusPath,
  listValidImportPreview,
  parseManagerOutcome,
  parseRowNormalized,
  parseRowRaw,
} from "@/lib/staff/import/queries";
import { getImportCreateProgress } from "@/lib/staff/import/service";
import { buildProbationPreview } from "@/lib/staff/import/validate";
import { importConfirmHref } from "@/lib/staff/url";

export const metadata = { title: "Create imported staff" };
export const maxDuration = 120;

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function ImportConfirmPage({
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
  const repeat = first(rawQuery.repeat) === "1";

  let record;
  try {
    record = await getImportForTenant(prisma, user.tenantId, id);
  } catch (error) {
    if (error instanceof StaffAccessError) {
      notFound();
    }
    throw error;
  }

  if (
    record.status !== StaffImportStatus.AWAITING_CONFIRMATION &&
    record.status !== StaffImportStatus.FAILED
  ) {
    redirect(importStatusPath(record.status, id));
  }

  const confirmable =
    record.status === StaffImportStatus.AWAITING_CONFIRMATION ||
    record.status === StaffImportStatus.FAILED;
  const progress = confirmable
    ? await getImportCreateProgress(prisma, user.tenantId, id)
    : null;

  const tenant = await prisma.tenant.findUnique({
    where: { id: user.tenantId },
    select: { defaultProbationDays: true },
  });
  const tenantDefaultDays =
    tenant?.defaultProbationDays && tenant.defaultProbationDays > 0
      ? tenant.defaultProbationDays
      : DEFAULT_PROBATION_DAYS;

  const preview = await listValidImportPreview(
    prisma,
    user.tenantId,
    id,
    page,
  );

  let existingManagers = 0;
  let importedManagers = 0;
  let defaultActive = 0;
  const omittedManagers: {
    id: string;
    staffLabel: string;
    submittedValue: string;
  }[] = [];
  const clearanceCounts = new Map<string, number>();
  const probationCounts = {
    TENANT_DEFAULT: 0,
    INDIVIDUAL_OVERRIDE: 0,
    MANUAL_END_DATE: 0,
  };

  for (const row of record.rows) {
    if (row.status !== "VALID") continue;
    const normalized = parseRowNormalized(row.normalized);
    if (!normalized) continue;
    if (normalized.employmentStatus === "ACTIVE") {
      defaultActive += 1;
    }
    clearanceCounts.set(
      normalized.securityClearanceStatus,
      (clearanceCounts.get(normalized.securityClearanceStatus) ?? 0) + 1,
    );
    const previewRow = buildProbationPreview(normalized, tenantDefaultDays);
    if (previewRow?.applyProbation && previewRow.durationSource) {
      probationCounts[previewRow.durationSource] += 1;
    }
    const manager = parseManagerOutcome(row.managerOutcome);
    if (manager?.kind === "existing") existingManagers += 1;
    if (manager?.kind === "import") importedManagers += 1;
    const suppliedManager = parseRowRaw(row.raw)["Manager Staff ID"].trim();
    if (suppliedManager && (!manager || manager.kind === "none")) {
      omittedManagers.push({
        id: row.id,
        staffLabel: `${normalized.staffIdNumber} ${normalized.firstName} ${normalized.lastName}`,
        submittedValue: suppliedManager,
      });
    }
  }

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
        Create staff
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
        Review import
      </h1>
      <p className="mt-2 max-w-2xl text-slate-600">
        Review the staff who will be created. This creates new operational staff
        records only. It does not update existing staff, create user accounts,
        or send communications.
      </p>
      <ImportStepper current="create" />

      {omittedManagers.length > 0 ? (
        <section
          className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4"
          role="alert"
        >
          <h2 className="text-sm font-semibold text-amber-950">
            {omittedManagers.length === 1
              ? "1 manager reference will not be saved"
              : `${omittedManagers.length} manager references will not be saved`}
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-amber-950">
            Manager Staff ID is optional. The{" "}
            {omittedManagers.length === 1 ? "value" : "values"} below could not
            be matched, so {omittedManagers.length === 1 ? "that" : "those"}{" "}
            manager {omittedManagers.length === 1 ? "field" : "fields"} will be
            empty on the staff record. Create the staff without{" "}
            {omittedManagers.length === 1 ? "it" : "them"}, or cancel and upload
            a corrected file. You can also add the manager after the staff are
            created.
          </p>
          <div className="mt-3 max-h-64 overflow-auto rounded-md border border-amber-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-amber-100 bg-amber-50/60 text-amber-950">
                <tr>
                  <th className="px-3 py-2 font-medium">Staff</th>
                  <th className="px-3 py-2 font-medium">Field</th>
                  <th className="px-3 py-2 font-medium">Submitted value</th>
                  <th className="px-3 py-2 font-medium">What will be saved</th>
                </tr>
              </thead>
              <tbody>
                {omittedManagers.map((item) => (
                  <tr key={item.id} className="border-b border-amber-100">
                    <td className="px-3 py-2 text-slate-900">{item.staffLabel}</td>
                    <td className="px-3 py-2 text-slate-700">Manager Staff ID</td>
                    <td className="px-3 py-2 text-slate-700">
                      {item.submittedValue}
                    </td>
                    <td className="px-3 py-2 text-slate-700">Left blank</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {repeat ? (
        <p
          className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          role="status"
        >
          This file matches a previous completed import. Check you are not
          adding the same people twice.
        </p>
      ) : null}

      {record.status === StaffImportStatus.FAILED &&
      record.createdStaffCount === 0 ? (
        <p
          className="mt-6 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
        >
          The previous create attempt did not keep any imported staff. You can
          try creating them again.
        </p>
      ) : null}

      {confirmable && progress ? (
        <div className="sticky top-0 z-10 mt-6 bg-white py-2">
          <ConfirmStaffImportForm
            importId={id}
            staffCount={record.validRows}
            progress={progress}
          />
        </div>
      ) : null}

      <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Staff to create" value={record.validRows} />
        <SummaryCard
          label="Using default Active status"
          value={defaultActive}
        />
        <SummaryCard
          label="Matched existing manager"
          value={existingManagers}
        />
        <SummaryCard
          label="Manager included in this import"
          value={importedManagers}
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

      <div className="mt-6">
        <CountList
          title="By clearance status"
          items={[...clearanceCounts.entries()].map(([status, count]) => ({
            label: clearanceLabel(
              status as Parameters<typeof clearanceLabel>[0],
            ),
            count,
          }))}
        />
      </div>

      <p className="mt-6 text-sm text-slate-500">
        Showing {preview.rows.length} of {preview.total} staff
        {preview.pageCount > 1
          ? ` · Page ${preview.page} of ${preview.pageCount}`
          : ""}
      </p>
      <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">Staff ID</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Department</th>
              <th className="px-4 py-3 font-medium">Manager</th>
              <th className="px-4 py-3 font-medium">Employment</th>
              <th className="px-4 py-3 font-medium">Probation</th>
              <th className="px-4 py-3 font-medium">Clearance</th>
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row) => {
              const normalized = parseRowNormalized(row.normalized);
              const manager = parseManagerOutcome(row.managerOutcome);
              const submittedManager = parseRowRaw(row.raw)["Manager Staff ID"].trim();
              const managerOmitted = Boolean(
                submittedManager && (!manager || manager.kind === "none"),
              );
              const probation = normalized
                ? buildProbationPreview(normalized, tenantDefaultDays)
                : null;
              return (
                <tr
                  key={row.id}
                  className={`border-b border-slate-100 align-top ${
                    managerOmitted ? "bg-amber-50" : ""
                  }`}
                >
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">
                    {normalized?.staffIdNumber ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {normalized
                      ? `${normalized.firstName} ${normalized.lastName}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {normalized?.roleTitle ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {normalized?.department ?? "—"}
                  </td>
                  <td
                    className={`px-4 py-3 ${
                      managerOmitted
                        ? "font-medium text-amber-950"
                        : "text-slate-700"
                    }`}
                  >
                    {managerOmitted
                      ? omittedManagerLabel(submittedManager)
                      : managerMappingLabel(manager)}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {normalized
                      ? employmentLabel(normalized.employmentStatus)
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {probationSummaryLabel(probation, tenantDefaultDays)}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {normalized
                      ? clearanceLabel(normalized.securityClearanceStatus)
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {preview.pageCount > 1 ? (
        <div className="mt-4 flex gap-2">
          {preview.page > 1 ? (
            <Link
              href={importConfirmHref(id, { page: preview.page - 1 })}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-50"
            >
              Previous
            </Link>
          ) : null}
          {preview.page < preview.pageCount ? (
            <Link
              href={importConfirmHref(id, { page: preview.page + 1 })}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-50"
            >
              Next
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="mt-8">
        <CancelStaffImportForm importId={id} />
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 text-2xl font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

function CountList({
  title,
  items,
}: {
  title: string;
  items: { label: string; count: number }[];
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <ul className="mt-2 space-y-1 text-sm text-slate-700">
        {items.map((item) => (
          <li key={item.label} className="flex justify-between gap-3">
            <span>{item.label}</span>
            <span>{item.count}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
