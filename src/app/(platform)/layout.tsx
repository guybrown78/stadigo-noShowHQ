import { Role } from "@prisma/client";
import { PlatformShell } from "@/components/platform-shell";
import { requireRole } from "@/lib/authz";

export const dynamic = "force-dynamic";

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole(Role.SUPER_ADMIN);

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
