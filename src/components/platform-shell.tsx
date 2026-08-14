"use client";

import { SidebarShell } from "@/components/sidebar-shell";

const navItems = [
  { href: "/admin", label: "Tenants", exact: true },
  { href: "/admin/tenants/new", label: "New tenant" },
];

const accountMenuItems = [{ href: "/profile", label: "Profile" }];

export function PlatformShell({
  user,
  children,
}: {
  user: {
    firstName: string;
    lastName: string;
    email: string;
    role: string;
  };
  children: React.ReactNode;
}) {
  return (
    <SidebarShell
      brandHref="/admin"
      brandSubtitle="Platform administration"
      navItems={navItems}
      accountMenuItems={accountMenuItems}
      user={user}
    >
      {children}
    </SidebarShell>
  );
}
