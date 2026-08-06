import Link from "next/link";
import { Role } from "@prisma/client";
import { logoutAction } from "@/app/(auth)/actions";
import { requireRole } from "@/lib/authz";

export const dynamic = "force-dynamic";

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole(Role.SUPER_ADMIN);

  return (
    <div className="min-h-full bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <div>
            <Link
              href="/admin"
              className="text-lg font-semibold tracking-tight text-slate-900"
            >
              NoShowHQ
            </Link>
            <p className="text-sm text-slate-500">Platform administration</p>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <div className="text-right">
              <p className="font-medium text-slate-900">
                {user.firstName} {user.lastName}
              </p>
              <p>
                {user.email} · {user.role}
              </p>
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-800 hover:bg-slate-50"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
        <nav
          className="mx-auto flex max-w-6xl gap-2 px-4 pb-3 text-sm"
          aria-label="Platform"
        >
          <Link
            href="/admin"
            className="rounded-md px-3 py-1.5 font-medium text-slate-800 hover:bg-slate-100"
          >
            Tenants
          </Link>
          <Link
            href="/admin/tenants/new"
            className="rounded-md px-3 py-1.5 font-medium text-slate-800 hover:bg-slate-100"
          >
            New tenant
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
