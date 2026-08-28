import Link from "next/link";

const items = [
  { href: "/staff", id: "directory", label: "Directory" },
  { href: "/staff/probation", id: "probation", label: "Probation" },
] as const;

export function StaffSectionNav({
  current,
  probationCount,
}: {
  current: (typeof items)[number]["id"];
  probationCount?: number;
}) {
  return (
    <nav className="mt-4 flex flex-wrap gap-2" aria-label="Staff sections">
      {items.map((item) => {
        const active = item.id === current;
        return (
          <Link
            key={item.id}
            href={item.href}
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${
              active
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
            }`}
            aria-current={active ? "page" : undefined}
          >
            {item.label}
            {item.id === "probation" && probationCount ? (
              <span
                className={`rounded-full px-1.5 text-xs font-semibold ${
                  active ? "bg-white text-slate-900" : "bg-slate-900 text-white"
                }`}
              >
                {probationCount}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
