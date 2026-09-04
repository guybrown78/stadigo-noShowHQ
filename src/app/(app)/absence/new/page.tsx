import Link from "next/link";
import { CancellationForm } from "@/components/absence/cancellation-form";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { londonTodayIso } from "@/lib/events/dates";
import { getStaffOptionForAbsence } from "@/lib/absence/queries";
import {
  absenceCancelHref,
  parseAbsenceReturnOrigin,
} from "@/lib/absence/url";
import { formatStaffName } from "@/lib/staff/display";

export const metadata = { title: "Log Absence" };

export default async function LogAbsencePage({
  searchParams,
}: {
  searchParams: Promise<{ staffId?: string; from?: string }>;
}) {
  const user = await requireTenant();
  const query = await searchParams;
  const initialStaff = query.staffId
    ? await getStaffOptionForAbsence(prisma, user.tenantId, query.staffId)
    : null;
  const origin = parseAbsenceReturnOrigin(query.from);
  const returnStaffId =
    origin === "staff" && initialStaff ? initialStaff.id : null;
  const cancelHref = absenceCancelHref({
    origin: returnStaffId ? "staff" : null,
    staffId: returnStaffId,
  });

  return (
    <div>
      <p className="text-sm text-slate-500">
        {returnStaffId && initialStaff ? (
          <Link href={`/staff/${returnStaffId}`} className="hover:underline">
            {formatStaffName(initialStaff)}
          </Link>
        ) : (
          <Link href="/dashboard" className="hover:underline">
            Dashboard
          </Link>
        )}
        <span aria-hidden="true"> / </span>
        Log Absence
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
        Log Absence
      </h1>
      <p className="mt-2 max-w-2xl text-slate-600">
        Record a staff cancellation against an existing event. Notice given is
        calculated for you.
      </p>
      <div className="mt-8 rounded-lg border border-slate-200 bg-white p-6">
        <CancellationForm
          mode="create"
          defaultReportedDate={londonTodayIso()}
          initialStaff={initialStaff}
          cancelHref={cancelHref}
        />
      </div>
    </div>
  );
}
