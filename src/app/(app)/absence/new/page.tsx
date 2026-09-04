import Link from "next/link";
import { CancellationForm } from "@/components/absence/cancellation-form";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { londonTodayIso } from "@/lib/events/dates";
import { getStaffOptionForAbsence } from "@/lib/absence/queries";

export const metadata = { title: "Log Absence" };

export default async function LogAbsencePage({
  searchParams,
}: {
  searchParams: Promise<{ staffId?: string }>;
}) {
  const user = await requireTenant();
  const query = await searchParams;
  const initialStaff = query.staffId
    ? await getStaffOptionForAbsence(prisma, user.tenantId, query.staffId)
    : null;

  return (
    <div>
      <p className="text-sm text-slate-500">
        <Link href="/dashboard" className="hover:underline">
          Dashboard
        </Link>
        <span aria-hidden="true"> / </span>
        Log Absence
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
        Log Absence
      </h1>
      <p className="mt-2 max-w-2xl text-slate-600">
        Record a staff cancellation against an existing event. Notice given is
        calculated for you. Follow-up starts as pending and will be managed from
        the Cancellation Ledger.
      </p>
      <div className="mt-8 rounded-lg border border-slate-200 bg-white p-6">
        <CancellationForm
          mode="create"
          defaultReportedDate={londonTodayIso()}
          initialStaff={initialStaff}
        />
      </div>
    </div>
  );
}
