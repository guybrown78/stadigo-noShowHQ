import Link from "next/link";

const items = [
  { href: "/events", id: "events", label: "Events" },
  { href: "/settings/events", id: "venues", label: "Venues" },
] as const;

export function EventsSectionNav({
  current,
}: {
  current: (typeof items)[number]["id"];
}) {
  return (
    <nav className="mt-4 flex flex-wrap gap-2" aria-label="Events sections">
      {items.map((item) => {
        const active = item.id === current;
        return (
          <Link
            key={item.id}
            href={item.href}
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              active
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
            }`}
            aria-current={active ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
