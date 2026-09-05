import { ProbationSettingsForm } from "@/components/staff/probation-settings-form";
import { Banner } from "@/components/ui/banner";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
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
      <PageHeader
        breadcrumbs={[
          { href: "/settings", label: "Settings" },
          { label: "Probation" },
        ]}
        title="Probation"
        description="Set the standard probation length for this organisation. New staff records use this default; existing probation dates stay as they are."
      />

      {flash.updated === "1" ? (
        <Banner tone="success" className="mt-6">
          Probation default saved. It applies to staff added after this change
          only.
        </Banner>
      ) : null}

      <Card className="mt-8 shadow-none">
        <CardBody className="p-6">
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
        </CardBody>
      </Card>
    </div>
  );
}
