import Link from "next/link";
import { enterTenantAction } from "@/app/(platform)/admin/actions";
import { prisma } from "@/lib/db";

export default async function AdminTenantsPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  const { created } = await searchParams;
  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { users: true } },
    },
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Tenants
          </h1>
          <p className="mt-2 text-slate-600">
            Organisations that use NoShowHQ. Open a tenant to view its
            application area.
          </p>
        </div>
        <Link
          href="/admin/tenants/new"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
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

      <div className="mt-8 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {tenants.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-medium text-slate-800">No tenants yet</p>
            <p className="mt-1 text-sm text-slate-500">
              Create your first organisation to provision a customer admin.
            </p>
          </div>
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Slug</th>
                <th className="px-4 py-3 font-medium">Users</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => (
                <tr key={tenant.id} className="border-b border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {tenant.name}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{tenant.slug}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {tenant._count.users}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {tenant.createdAt.toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Link
                        href={`/admin/tenants/${tenant.id}`}
                        className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-800 hover:bg-slate-50"
                      >
                        Manage
                      </Link>
                      <form action={enterTenantAction}>
                        <input type="hidden" name="tenantId" value={tenant.id} />
                        <button
                          type="submit"
                          className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-800 hover:bg-slate-50"
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
