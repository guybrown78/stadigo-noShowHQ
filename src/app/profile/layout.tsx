import { Role } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { PlatformShell } from "@/components/platform-shell";
import { getActingTenantId } from "@/lib/acting-tenant";
import { requireAuth, requireTenant } from "@/lib/authz";

export const dynamic = "force-dynamic";

export default async function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAuth();

  if (user.role === Role.SUPER_ADMIN) {
    const actingTenantId = await getActingTenantId();
    if (!actingTenantId) {
      return (
        <PlatformShell
          user={{
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            role: user.role,
          }}
        >
          {children}
        </PlatformShell>
      );
    }
  }

  const tenantUser = await requireTenant();

  return (
    <AppShell
      user={{
        firstName: tenantUser.firstName,
        lastName: tenantUser.lastName,
        email: tenantUser.email,
        role: tenantUser.role,
      }}
      tenant={{
        name: tenantUser.tenantName,
        slug: tenantUser.tenantSlug,
      }}
      isActingAsTenant={tenantUser.isActingAsTenant}
    >
      {children}
    </AppShell>
  );
}
