import { AppShell } from "@/components/app-shell";
import { requireTenant } from "@/lib/authz";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireTenant();

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
    >
      {children}
    </AppShell>
  );
}
