"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { logoutAction } from "@/app/(auth)/actions";

export type SidebarNavItem = {
  href: string;
  label: string;
  /** Match only this exact path. Default matches the path or nested routes. */
  exact?: boolean;
};

export function SidebarShell({
  brandHref,
  brandTitle = "NoShowHQ",
  brandSubtitle,
  navItems,
  user,
  banner,
  children,
}: {
  brandHref: string;
  brandTitle?: string;
  brandSubtitle?: string;
  navItems: SidebarNavItem[];
  user: {
    firstName: string;
    lastName: string;
    email: string;
    role: string;
  };
  banner?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const navId = useId();

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function isActive(item: SidebarNavItem) {
    if (item.exact) {
      return pathname === item.href;
    }
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 px-5 py-5">
        <Link
          href={brandHref}
          className="text-lg font-semibold tracking-tight text-slate-900"
          onClick={() => setOpen(false)}
        >
          {brandTitle}
        </Link>
        {brandSubtitle ? (
          <p className="mt-1 truncate text-sm text-slate-500">{brandSubtitle}</p>
        ) : null}
      </div>

      <nav
        id={navId}
        className="flex-1 overflow-y-auto px-3 py-4"
        aria-label="Primary"
      >
        <ul className="space-y-1">
          {navItems.map((item) => {
            const active = isActive(item);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`block rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
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

      <div className="border-t border-slate-200 p-4">
        <div className="mb-3 min-w-0">
          <p className="truncate text-sm font-medium text-slate-900">
            {user.firstName} {user.lastName}
          </p>
          <p className="truncate text-xs text-slate-500">{user.email}</p>
          <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-slate-400">
            {user.role.replace(/_/g, " ")}
          </p>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-slate-50">
      {banner}

      <div className="lg:flex lg:min-h-dvh">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 text-slate-800 hover:bg-slate-50"
            aria-expanded={open}
            aria-controls={navId}
            onClick={() => setOpen(true)}
          >
            <span className="sr-only">Open navigation</span>
            <span aria-hidden="true" className="flex flex-col gap-1.5">
              <span className="block h-0.5 w-5 bg-current" />
              <span className="block h-0.5 w-5 bg-current" />
              <span className="block h-0.5 w-5 bg-current" />
            </span>
          </button>
          <div className="min-w-0">
            <p className="truncate font-semibold tracking-tight text-slate-900">
              {brandTitle}
            </p>
            {brandSubtitle ? (
              <p className="truncate text-xs text-slate-500">{brandSubtitle}</p>
            ) : null}
          </div>
        </header>

        <div
          className={`fixed inset-0 z-40 bg-slate-900/40 transition-opacity duration-300 lg:hidden ${
            open
              ? "pointer-events-auto opacity-100"
              : "pointer-events-none opacity-0"
          }`}
          aria-hidden={!open}
          onClick={() => setOpen(false)}
        />

        <aside
          className={`fixed inset-y-0 left-0 z-50 w-72 border-r border-slate-200 bg-white shadow-xl transition-transform duration-300 ease-out lg:static lg:z-0 lg:h-auto lg:min-h-dvh lg:shrink-0 lg:shadow-none ${
            open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
          }`}
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 lg:hidden">
            <p className="text-sm font-medium text-slate-900">Menu</p>
            <button
              type="button"
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-800 hover:bg-slate-50"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
          {sidebar}
        </aside>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
