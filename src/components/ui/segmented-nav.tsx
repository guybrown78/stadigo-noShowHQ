import Link from "next/link";
import { cn } from "@/lib/cn";

export function SegmentedNav({
  label,
  items,
  className,
}: {
  label: string;
  items: Array<{
    href: string;
    label: string;
    active?: boolean;
    disabled?: boolean;
    /**
     * Extra text shown on a disabled item. Defaults to "Coming soon".
     * Pass null when the surrounding screen already explains why it is unavailable.
     */
    disabledNote?: string | null;
    badge?: number;
  }>;
  className?: string;
}) {
  return (
    <nav className={cn("flex flex-wrap gap-2", className)} aria-label={label}>
      {items.map((item) => {
        if (item.disabled) {
          const note =
            item.disabledNote === undefined ? "Coming soon" : item.disabledNote;
          return (
            <span
              key={item.label}
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium",
                item.active
                  ? "bg-primary-soft text-primary-hover ring-1 ring-primary/30"
                  : "bg-slate-50 text-slate-400 ring-1 ring-slate-200",
              )}
              aria-disabled="true"
              aria-current={item.active ? "page" : undefined}
            >
              {item.label}
              {note ? (
                <span className="text-xs font-medium text-slate-500">{note}</span>
              ) : null}
            </span>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium",
              item.active
                ? "bg-primary text-white"
                : "bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50",
            )}
            aria-current={item.active ? "page" : undefined}
          >
            {item.label}
            {item.badge ? (
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs font-semibold",
                  item.active
                    ? "bg-white text-primary-hover"
                    : "bg-primary text-white",
                )}
              >
                {item.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
