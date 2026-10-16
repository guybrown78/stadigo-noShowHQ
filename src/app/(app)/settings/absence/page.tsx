import { PageHeader } from "@/components/ui/page-header";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { AbsenceSettingsForms } from "@/components/settings/absence-settings-forms";

export const metadata = { title: "Absence settings" };

export default async function AbsenceSettingsPage() {
  const user = await requireTenant();
  const [tenant, reasons] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({
      where: { id: user.tenantId },
      select: {
        shortNoticeHours: true,
        payPeriodStartDay: true,
        cancellationThreshold: true,
        awolThresholdCount: true,
        awolWindowDays: true,
      },
    }),
    prisma.absenceReason.findMany({
      where: { tenantId: user.tenantId },
      orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { label: "asc" }],
    }),
  ]);

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { href: "/dashboard", label: "Dashboard" },
          { href: "/settings", label: "Settings" },
          { label: "Absence" },
        ]}
        title="Absence"
        description="Reason lists and attendance thresholds for this organisation. Changing a threshold does not rewrite records already saved."
      />
      <AbsenceSettingsForms tenant={tenant} reasons={reasons} />
    </div>
  );
}
