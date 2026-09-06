"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronUp, Menu, X, type LucideIcon } from "lucide-react";
import { logoutAction } from "@/app/(auth)/actions";
import { Avatar, initialsFor } from "@/components/ui/avatar";
import { BrandMark } from "@/components/ui/brand-mark";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export type SidebarNavItem = {
  href: string;
  label: string;
  icon?: LucideIcon;
  /** Match only this exact path. Default matches the path or nested routes. */
  exact?: boolean;
  /** Additional path prefixes treated as active, e.g. venues under Settings. */
  alsoMatch?: string[];
  badge?: number;
};

export type SidebarNavGroup = {
  label: string;
  items: SidebarNavItem[];
};

export type AccountMenuItem = {
  href: string;
  label: string;
};

export function SidebarShell({
  brandHref,
  brandTitle = "NoShowHQ",
  brandSubtitle,
  navItems,
  navGroups,
  accountMenuItems = [],
  user,
  banner,
  children,
}: {
  brandHref: string;
  brandTitle?: string;
  brandSubtitle?: string;
  navItems?: SidebarNavItem[];
  navGroups?: SidebarNavGroup[];
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
  const groups =
    navGroups ??
    (navItems?.length
      ? [{ label: "", items: navItems }]
      : []);

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
      return (
        pathname === item.href ||
        (item.alsoMatch ?? []).some((prefix) => pathMatches(prefix))
      );
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
      <div className="shrink-0 border-b border-border px-5 py-5">
        <Link
          href={brandHref}
          className="block"
          onClick={() => setDrawerOpen(false)}
        >
          <BrandMark title={brandTitle} />
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
        <div className="space-y-5">
          {groups.map((group) => (
            <div key={group.label || "nav"}>
              {group.label ? (
                <p className="px-3 pb-2 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                  {group.label}
                </p>
              ) : null}
              <ul className="space-y-1">
                {group.items.map((item) => {
                  const active = isActive(item);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setDrawerOpen(false)}
                        className={cn(
                          "flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                          active
                            ? "bg-primary-soft text-primary-hover"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                        )}
                        aria-current={active ? "page" : undefined}
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          {Icon ? (
                            <Icon
                              className={cn(
                                "size-4 shrink-0",
                                active ? "text-primary" : "text-slate-400",
                              )}
                              aria-hidden="true"
                            />
                          ) : null}
                          <span className="truncate">{item.label}</span>
                        </span>
                        {item.badge ? (
                          <span
                            className={cn(
                              "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold",
                              active
                                ? "bg-primary text-white"
                                : "bg-slate-900 text-white",
                            )}
                            aria-label={`${item.badge} open probation tasks`}
                          >
                            {item.badge}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      <div
        ref={accountRef}
        className="relative shrink-0 border-t border-border p-3"
      >
        {accountOpen ? (
          <div
            id={accountMenuId}
            className="absolute inset-x-3 bottom-full z-10 mb-2 overflow-hidden rounded-xl border border-border bg-white shadow-lg"
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
          className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-100"
          aria-expanded={accountOpen}
          aria-controls={accountMenuId}
          onClick={() => setAccountOpen((value) => !value)}
        >
          <Avatar initials={initials} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-slate-900">
              {displayName}
            </span>
            <span className="block truncate text-xs text-slate-500">
              {user.role.replace(/_/g, " ")}
            </span>
          </span>
          <ChevronUp
            className={cn(
              "size-4 shrink-0 text-slate-400 transition-transform",
              accountOpen ? "rotate-0" : "rotate-180",
            )}
            aria-hidden="true"
          />
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-background">
      {banner}

      <div className="lg:flex lg:min-h-dvh">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-white px-4 py-3 lg:hidden">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-10 w-10 px-0"
            aria-expanded={drawerOpen}
            aria-controls={navId}
            onClick={() => setDrawerOpen(true)}
          >
            <span className="sr-only">Open navigation</span>
            <Menu className="size-5" aria-hidden="true" />
          </Button>
          <div className="min-w-0">
            <BrandMark title={brandTitle} size="sm" />
            {brandSubtitle ? (
              <p className="truncate text-xs text-slate-500">{brandSubtitle}</p>
            ) : null}
          </div>
        </header>

        <div
          className={cn(
            "fixed inset-0 z-40 bg-slate-900/40 transition-opacity duration-300 lg:hidden",
            drawerOpen
              ? "pointer-events-auto opacity-100"
              : "pointer-events-none opacity-0",
          )}
          aria-hidden={!drawerOpen}
          onClick={() => setDrawerOpen(false)}
        />

        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex h-dvh w-72 flex-col border-r border-border bg-white shadow-xl transition-transform duration-300 ease-out lg:sticky lg:top-0 lg:z-0 lg:h-dvh lg:shrink-0 lg:shadow-none",
            drawerOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          )}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3 lg:hidden">
            <p className="text-sm font-medium text-slate-900">Menu</p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setDrawerOpen(false)}
            >
              <X className="size-4" aria-hidden="true" />
              Close
            </Button>
          </div>
          <div className="min-h-0 flex-1">{sidebar}</div>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
