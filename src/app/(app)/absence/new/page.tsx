import { CancellationForm } from "@/components/absence/cancellation-form";
import { PageHeader } from "@/components/ui/page-header";
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
      <PageHeader
        breadcrumbs={
          returnStaffId && initialStaff
            ? [
                { href: `/staff/${returnStaffId}`, label: formatStaffName(initialStaff) },
                { label: "Log Absence" },
              ]
            : [
                { href: "/dashboard", label: "Dashboard" },
                { label: "Log Absence" },
              ]
        }
        title="Log an Absence"
        description="Record a staff cancellation against an existing event. Notice given is calculated for you."
      />
      <div className="mt-8">
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
