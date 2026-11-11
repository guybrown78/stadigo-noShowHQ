import Link from "next/link";
import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { enterTenantAction } from "@/app/(platform)/admin/actions";
import { AdminActivitySummary } from "@/components/admin-activity";
import { CreateTenantAdminForm } from "@/components/create-tenant-admin-form";
import { ResetAdminPasswordForm } from "@/components/reset-admin-password-form";
import { prisma } from "@/lib/db";

export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      users: {
        where: { role: Role.ADMIN },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          createdAt: true,
          lastLoggedInAt: true,
          lastActiveAt: true,
        },
      },
    },
  });

  if (!tenant) {
    notFound();
  }

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/admin"
          className="text-sm font-medium text-muted underline-offset-2 hover:text-foreground hover:underline"
        >
          ← Back to tenants
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[1.75rem] leading-8 font-semibold tracking-[-0.02em] text-foreground">
            {tenant.name}
          </h1>
          <p className="mt-2 text-muted">
            Slug <span className="font-medium text-foreground">{tenant.slug}</span>
          </p>
        </div>
        <form action={enterTenantAction}>
          <input type="hidden" name="tenantId" value={tenant.id} />
          <button
            type="submit"
            className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-wash"
          >
            Open tenant app
          </button>
        </form>
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-medium text-foreground">Tenant admins</h2>
        <p className="mt-1 text-sm text-muted">
          Add another administrator for this organisation, or set a temporary
          password when an admin cannot sign in. Last signed in and last
          activity are UK time; “Never” means none has been recorded yet.
        </p>

        <div className="mt-6">
          <CreateTenantAdminForm tenantId={tenant.id} />
        </div>

        <div className="mt-6 space-y-6">
          {tenant.users.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-surface px-6 py-10 text-center text-sm text-muted">
              No admin users for this tenant.
            </div>
          ) : (
            tenant.users.map((user) => (
              <div
                key={user.id}
                className="rounded-lg border border-border bg-surface p-5"
              >
                <div className="mb-4">
                  <p className="font-medium text-foreground">
                    {user.firstName} {user.lastName}
                  </p>
                  <p className="text-sm text-muted">
                    {user.email} · {user.role}
                  </p>
                  <div className="mt-2">
                    <AdminActivitySummary
                      lastLoggedInAt={user.lastLoggedInAt}
                      lastActiveAt={user.lastActiveAt}
                    />
                  </div>
                </div>
                <ResetAdminPasswordForm
                  tenantId={tenant.id}
                  userId={user.id}
                  userLabel={`${user.firstName} ${user.lastName}`}
                />
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
