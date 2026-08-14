import Link from "next/link";
import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { enterTenantAction } from "@/app/(platform)/admin/actions";
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
          className="text-sm font-medium text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline"
        >
          ← Back to tenants
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {tenant.name}
          </h1>
          <p className="mt-2 text-slate-600">
            Slug <span className="font-medium text-slate-800">{tenant.slug}</span>
          </p>
        </div>
        <form action={enterTenantAction}>
          <input type="hidden" name="tenantId" value={tenant.id} />
          <button
            type="submit"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            Open tenant app
          </button>
        </form>
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-medium text-slate-900">Tenant admins</h2>
        <p className="mt-1 text-sm text-slate-600">
          Set a temporary password when an admin cannot sign in. Share it with
          them securely; they can change it later in Settings.
        </p>

        <div className="mt-6 space-y-6">
          {tenant.users.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-600">
              No admin users for this tenant.
            </div>
          ) : (
            tenant.users.map((user) => (
              <div
                key={user.id}
                className="rounded-lg border border-slate-200 bg-white p-5"
              >
                <div className="mb-4">
                  <p className="font-medium text-slate-900">
                    {user.firstName} {user.lastName}
                  </p>
                  <p className="text-sm text-slate-600">
                    {user.email} · {user.role}
                  </p>
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
