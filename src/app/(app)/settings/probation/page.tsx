import Link from "next/link";
import { ProbationSettingsForm } from "@/components/staff/probation-settings-form";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { getTenantProbationSettings } from "@/lib/staff/settings";

export const metadata = { title: "Probation settings" };

export default async function ProbationSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ updated?: string }>;
}) {
  const user = await requireTenant();
  const flash = await searchParams;
  const settings = await getTenantProbationSettings(prisma, user.tenantId);

  return (
    <div>
      <p className="text-sm text-slate-500">
        <Link href="/settings" className="hover:underline">
          Settings
        </Link>
        <span aria-hidden="true"> / </span>
        Probation
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
        Probation
      </h1>
      <p className="mt-2 max-w-2xl text-slate-600">
        Set the standard probation length for this organisation. New staff
        records use this default; existing probation dates stay as they are.
      </p>

      {flash.updated === "1" ? (
        <p
          className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
          role="status"
        >
          Probation default saved. It applies to staff added after this change
          only.
        </p>
      ) : null}

      <div className="mt-8 rounded-lg border border-slate-200 bg-white p-6">
        <p className="text-sm text-slate-600">
          Current default:{" "}
          <span className="font-medium text-slate-900">
            {settings.defaultProbationDays} days
          </span>
        </p>
        {settings.updatedAt ? (
          <p className="mt-1 text-sm text-slate-500">
            Last changed {settings.updatedAt.toLocaleString("en-GB")}
            {settings.updatedBy
              ? ` by ${settings.updatedBy.firstName} ${settings.updatedBy.lastName}`
              : ""}
            .
          </p>
        ) : (
          <p className="mt-1 text-sm text-slate-500">
            Using the organisation default of 90 days until an administrator
            saves a change.
          </p>
        )}
        <ProbationSettingsForm
          defaultProbationDays={settings.defaultProbationDays}
        />
      </div>
    </div>
  );
}
