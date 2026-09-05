import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { StaffForm } from "@/components/staff/staff-form";
import { StaffSectionNav } from "@/components/staff/staff-section-nav";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getTenantProbationDefault } from "@/lib/staff/queries";

export const metadata = { title: "Add staff member" };

export default async function NewStaffPage() {
  const user = await requireTenant();
  const defaultProbationDays = await getTenantProbationDefault(
    prisma,
    user.tenantId,
  );

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { href: "/staff", label: "Staff" },
          { label: "Add staff member" },
        ]}
        title="Add staff member"
        description="Create an operational staff record. This does not create a login or send a message to the person."
      >
        <StaffSectionNav current="directory" />
      </PageHeader>
      <Card className="mt-8 shadow-none">
        <CardBody className="p-6">
          <StaffForm mode="create" defaultProbationDays={defaultProbationDays} />
        </CardBody>
      </Card>
    </div>
  );
}
