"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logoutAction } from "@/app/(auth)/actions";
import { exitTenantAction } from "@/app/(platform)/admin/actions";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/staff", label: "Staff" },
  { href: "/events", label: "Events" },
  { href: "/ledger", label: "Ledger" },
  { href: "/absence/new", label: "Log Absence" },
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
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-full bg-slate-50">
      {isActingAsTenant ? (
        <div className="border-b border-amber-200 bg-amber-50">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm text-amber-950">
            <p>
              Viewing tenant <span className="font-semibold">{tenant.name}</span>{" "}
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
      ) : null}

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-800 md:hidden"
              aria-expanded={open}
              aria-controls="app-nav"
              onClick={() => setOpen((value) => !value)}
            >
              Menu
            </button>
            <div>
              <Link
                href="/dashboard"
                className="text-lg font-semibold tracking-tight text-slate-900"
              >
                NoShowHQ
              </Link>
              <p className="text-xs text-slate-500">{tenant.name}</p>
            </div>
          </div>

          <div className="hidden items-center gap-3 text-sm text-slate-600 md:flex">
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
          id="app-nav"
          className={`${open ? "block" : "hidden"} border-t border-slate-200 md:block`}
          aria-label="Primary"
        >
          <ul className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-2 md:flex-row md:gap-1 md:py-0">
            {navItems.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/dashboard" && pathname.startsWith(item.href));
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={`block rounded-md px-3 py-2 text-sm font-medium md:rounded-none md:border-b-2 md:px-3 md:py-3 ${
                      active
                        ? "bg-slate-100 text-slate-900 md:border-slate-900 md:bg-transparent"
                        : "border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900 md:hover:bg-transparent"
                    }`}
                    aria-current={active ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600 md:hidden">
          <div>
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
              className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-800"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
