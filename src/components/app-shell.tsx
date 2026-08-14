"use client";

import { exitTenantAction } from "@/app/(platform)/admin/actions";
import { SidebarShell } from "@/components/sidebar-shell";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/staff", label: "Staff" },
  { href: "/events", label: "Events" },
  { href: "/ledger", label: "Ledger" },
  { href: "/absence/new", label: "Log Absence" },
];

const accountMenuItems = [
  { href: "/profile", label: "Profile" },
  { href: "/settings", label: "Settings" },
];

export function AppShell({
  user,
  tenant,
  isActingAsTenant,
  children,
}: {
  user: {
    firstName: string;
    lastName: string;
    email: string;
    role: string;
  };
  tenant: {
    name: string;
    slug: string;
  };
  isActingAsTenant: boolean;
  children: React.ReactNode;
}) {
  return (
    <SidebarShell
      brandHref="/dashboard"
      brandSubtitle={tenant.name}
      navItems={navItems}
      accountMenuItems={accountMenuItems}
      user={user}
      banner={
        isActingAsTenant ? (
          <div className="border-b border-amber-200 bg-amber-50">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm text-amber-950 lg:px-6">
              <p>
                Viewing tenant{" "}
                <span className="font-semibold">{tenant.name}</span>{" "}
                <span className="text-amber-800">({tenant.slug})</span> as
                platform admin
              </p>
              <form action={exitTenantAction}>
                <button
                  type="submit"
                  className="rounded-md border border-amber-300 bg-white px-3 py-1 font-medium text-amber-950 hover:bg-amber-100"
                >
                  Back to platform admin
                </button>
              </form>
            </div>
          </div>
        ) : null
      }
    >
      {children}
    </SidebarShell>
  );
}
