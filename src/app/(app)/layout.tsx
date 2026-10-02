import { AppShell } from "@/components/app-shell";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { countActionableFollowUps } from "@/lib/absence/follow-up-service";
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
  const [staffTaskCount, followUpCount] = await Promise.all([
    countOpenProbationTasks(prisma, user.tenantId),
    countActionableFollowUps(prisma, user.tenantId),
  ]);

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
      followUpCount={followUpCount}
    >
      {children}
    </AppShell>
  );
}
