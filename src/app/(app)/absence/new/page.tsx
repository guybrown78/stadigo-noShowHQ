import { LogAbsenceForm } from "@/components/absence/log-absence-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { todayIsoInTimeZone } from "@/lib/absence/timezone";
import { getStaffOptionForAbsence } from "@/lib/absence/queries";
import {
  absenceCancelHref,
  parseAbsenceReturnOrigin,
} from "@/lib/absence/url";
import { listActiveReasonLabels } from "@/lib/absence/reasons";
import { formatStaffName } from "@/lib/staff/display";

export const metadata = { title: "Log Absence" };

export default async function LogAbsencePage({
  searchParams,
}: {
  searchParams: Promise<{ staffId?: string; from?: string; type?: string }>;
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
  const initialType =
    query.type === "awol"
      ? "AWOL"
      : query.type === "sickness"
        ? "SICKNESS"
        : "CANCELLATION";
  const defaultReportedDate = todayIsoInTimeZone(user.tenantTimezone);
  const [cancellationReasons, sicknessReasons, tenant] = await Promise.all([
    listActiveReasonLabels(prisma, user.tenantId, "CANCELLATION"),
    listActiveReasonLabels(prisma, user.tenantId, "SICKNESS"),
    prisma.tenant.findUniqueOrThrow({
      where: { id: user.tenantId },
      select: { shortNoticeHours: true },
    }),
  ]);

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
        description="Record a Cancellation, AWOL or Sickness absence."
      />
      <div className="mt-8">
        <LogAbsenceForm
          initialType={initialType}
          defaultReportedDate={defaultReportedDate}
          timeZone={user.tenantTimezone}
          initialStaff={initialStaff}
          cancelHref={cancelHref}
          cancellationReasons={cancellationReasons}
          sicknessReasons={sicknessReasons}
          shortNoticeHours={tenant.shortNoticeHours}
        />
      </div>
    </div>
  );
}
