"use client";

import {
  BookOpen,
  Calendar,
  ClipboardPlus,
  LayoutDashboard,
  Settings,
  Users,
} from "lucide-react";
import { exitTenantAction } from "@/app/(platform)/admin/actions";
import { SidebarShell } from "@/components/sidebar-shell";
import { Button } from "@/components/ui/button";

const accountMenuItems = [{ href: "/profile", label: "Profile" }];

export function AppShell({
  user,
  tenant,
  isActingAsTenant,
  staffTaskCount = 0,
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
  staffTaskCount?: number;
  children: React.ReactNode;
}) {
  const navGroups = [
    {
      label: "Main",
      items: [
        { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { href: "/absence/new", label: "Log Absence", icon: ClipboardPlus },
        { href: "/ledger", label: "Ledger", icon: BookOpen },
      ],
    },
    {
      label: "Manage",
      items: [
        {
          href: "/events",
          label: "Events",
          icon: Calendar,
          alsoMatch: ["/settings/events"],
        },
        {
          href: "/staff",
          label: "Staff",
          icon: Users,
          badge: staffTaskCount || undefined,
        },
      ],
    },
    {
      label: "Account",
      items: [
        {
          href: "/settings",
          label: "Settings",
          icon: Settings,
          exact: true,
          alsoMatch: ["/settings/probation"],
        },
      ],
    },
  ];

  return (
    <SidebarShell
      brandHref="/dashboard"
      brandSubtitle={tenant.name}
      navGroups={navGroups}
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
                <Button type="submit" variant="secondary" size="sm">
                  Back to platform admin
                </Button>
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
