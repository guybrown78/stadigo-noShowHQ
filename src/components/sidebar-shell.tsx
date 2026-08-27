"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { logoutAction } from "@/app/(auth)/actions";

export type SidebarNavItem = {
  href: string;
  label: string;
  /** Match only this exact path. Default matches the path or nested routes. */
  exact?: boolean;
  /** Additional path prefixes treated as active, e.g. venues under Settings. */
  alsoMatch?: string[];
};

export type AccountMenuItem = {
  href: string;
  label: string;
};

function initialsFor(firstName: string, lastName: string) {
  const first = firstName.trim().charAt(0);
  const last = lastName.trim().charAt(0);
  return `${first}${last}`.toUpperCase() || "?";
}

export function SidebarShell({
  brandHref,
  brandTitle = "NoShowHQ",
  brandSubtitle,
  navItems,
  accountMenuItems = [],
  user,
  banner,
  children,
}: {
  brandHref: string;
  brandTitle?: string;
  brandSubtitle?: string;
  navItems: SidebarNavItem[];
  accountMenuItems?: AccountMenuItem[];
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const navId = useId();
  const accountMenuId = useId();
  const accountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!drawerOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDrawerOpen(false);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerOpen]);

  useEffect(() => {
    if (!accountOpen) return;

    function onPointerDown(event: MouseEvent) {
      if (
        accountRef.current &&
        !accountRef.current.contains(event.target as Node)
      ) {
        setAccountOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setAccountOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [accountOpen]);

  function pathMatches(prefix: string) {
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  }

  function isActive(item: SidebarNavItem) {
    if (item.exact) {
      return pathname === item.href;
    }
    if (pathMatches(item.href)) {
      return true;
    }
    return (item.alsoMatch ?? []).some((prefix) => pathMatches(prefix));
  }

  const displayName = `${user.firstName} ${user.lastName}`.trim();
  const initials = initialsFor(user.firstName, user.lastName);

  const sidebar = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-slate-200 px-5 py-5">
        <Link
          href={brandHref}
          className="text-lg font-semibold tracking-tight text-slate-900"
          onClick={() => setDrawerOpen(false)}
        >
          {brandTitle}
        </Link>
        {brandSubtitle ? (
          <p className="mt-1 truncate text-sm text-slate-500">{brandSubtitle}</p>
        ) : null}
      </div>

      <nav
        id={navId}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-4"
        aria-label="Primary"
      >
        <ul className="space-y-1">
          {navItems.map((item) => {
            const active = isActive(item);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setDrawerOpen(false)}
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

      <div
        ref={accountRef}
        className="relative shrink-0 border-t border-slate-200 p-3"
      >
        {accountOpen ? (
          <div
            id={accountMenuId}
            className="absolute inset-x-3 bottom-full z-10 mb-2 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
            role="menu"
            aria-label="Account menu"
          >
            <div className="border-b border-slate-100 px-3 py-2">
              <p className="truncate text-sm font-medium text-slate-900">
                {displayName}
              </p>
              <p className="truncate text-xs text-slate-500">{user.email}</p>
            </div>
            <ul className="py-1">
              {accountMenuItems.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    role="menuitem"
                    className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    onClick={() => {
                      setAccountOpen(false);
                      setDrawerOpen(false);
                    }}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
              <li>
                <form action={logoutAction}>
                  <button
                    type="submit"
                    role="menuitem"
                    className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Sign out
                  </button>
                </form>
              </li>
            </ul>
          </div>
        ) : null}

        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-slate-100"
          aria-expanded={accountOpen}
          aria-controls={accountMenuId}
          onClick={() => setAccountOpen((value) => !value)}
        >
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold tracking-wide text-white"
            aria-hidden="true"
          >
            {initials}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-slate-900">
              {displayName}
            </span>
            <span className="block truncate text-xs text-slate-500">
              {user.role.replace(/_/g, " ")}
            </span>
          </span>
          <span
            className={`shrink-0 text-slate-400 transition-transform ${accountOpen ? "rotate-180" : ""}`}
            aria-hidden="true"
          >
            ▾
          </span>
        </button>
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
            aria-expanded={drawerOpen}
            aria-controls={navId}
            onClick={() => setDrawerOpen(true)}
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
            drawerOpen
              ? "pointer-events-auto opacity-100"
              : "pointer-events-none opacity-0"
          }`}
          aria-hidden={!drawerOpen}
          onClick={() => setDrawerOpen(false)}
        />

        <aside
          className={`fixed inset-y-0 left-0 z-50 flex h-dvh w-72 flex-col border-r border-slate-200 bg-white shadow-xl transition-transform duration-300 ease-out lg:sticky lg:top-0 lg:z-0 lg:h-dvh lg:shrink-0 lg:shadow-none ${
            drawerOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
          }`}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3 lg:hidden">
            <p className="text-sm font-medium text-slate-900">Menu</p>
            <button
              type="button"
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-800 hover:bg-slate-50"
              onClick={() => setDrawerOpen(false)}
            >
              Close
            </button>
          </div>
          <div className="min-h-0 flex-1">{sidebar}</div>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
