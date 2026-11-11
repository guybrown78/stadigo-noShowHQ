import Link from "next/link";
import { Role } from "@prisma/client";
import { enterTenantAction } from "@/app/(platform)/admin/actions";
import { AdminActivitySummary } from "@/components/admin-activity";
import { prisma } from "@/lib/db";
import { formatLondonDate } from "@/lib/events/dates";

export default async function AdminTenantsPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  const { created } = await searchParams;
  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      users: {
        where: { role: Role.ADMIN },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        select: {
          id: true,
          firstName: true,
          lastName: true,
          lastLoggedInAt: true,
          lastActiveAt: true,
        },
      },
    },
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[1.75rem] leading-8 font-semibold tracking-[-0.02em] text-foreground">
            Tenants
          </h1>
          <p className="mt-2 text-muted">
            Organisations that use NoShowHQ. See when each admin last signed
            in or used the app, then open a tenant to view its application
            area.
          </p>
        </div>
        <Link
          href="/admin/tenants/new"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
        >
          Create tenant
        </Link>
      </div>

      {created === "1" ? (
        <p
          className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
          role="status"
        >
          Tenant and admin user created.
        </p>
      ) : null}

      <div className="mt-8 overflow-hidden rounded-lg border border-border bg-surface">
        {tenants.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-medium text-foreground">No tenants yet</p>
            <p className="mt-1 text-sm text-muted">
              Create your first organisation to provision a customer admin.
            </p>
          </div>
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Slug</th>
                <th className="px-4 py-3 font-medium">Admins</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => (
                <tr key={tenant.id} className="border-b border-row hover:bg-wash">
                  <td className="px-4 py-3 font-medium text-foreground">
                    {tenant.name}
                  </td>
                  <td className="px-4 py-3 text-muted">{tenant.slug}</td>
                  <td className="px-4 py-3 text-muted">
                    {tenant.users.length === 0 ? (
                      "—"
                    ) : (
                      <ul className="space-y-2">
                        {tenant.users.map((user) => (
                          <li key={user.id}>
                            <p className="font-medium text-foreground">
                              {user.firstName} {user.lastName}
                            </p>
                            <AdminActivitySummary
                              lastLoggedInAt={user.lastLoggedInAt}
                              lastActiveAt={user.lastActiveAt}
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {formatLondonDate(tenant.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Link
                        href={`/admin/tenants/${tenant.id}`}
                        className="rounded-md border border-border px-3 py-1.5 font-medium text-foreground hover:bg-wash"
                      >
                        Manage
                      </Link>
                      <form action={enterTenantAction}>
                        <input type="hidden" name="tenantId" value={tenant.id} />
                        <button
                          type="submit"
                          className="rounded-md border border-border px-3 py-1.5 font-medium text-foreground hover:bg-wash"
                        >
                          Open
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
