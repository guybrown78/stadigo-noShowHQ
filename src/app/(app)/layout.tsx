import { AppShell } from "@/components/app-shell";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import {
  countOpenProbationTasks,
  reconcileTenantProbationWork,
} from "@/lib/staff/tasks";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireTenant();
  await reconcileTenantProbationWork(prisma, user.tenantId);
  const staffTaskCount = await countOpenProbationTasks(prisma, user.tenantId);

  return (
    <AppShell
      user={{
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
      }}
      tenant={{
        name: user.tenantName,
        slug: user.tenantSlug,
      }}
      isActingAsTenant={user.isActingAsTenant}
      staffTaskCount={staffTaskCount}
    >
      {children}
    </AppShell>
  );
}
