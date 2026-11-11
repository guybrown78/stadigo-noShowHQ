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
    <nav
      className={cn(
        "inline-flex max-w-full flex-wrap gap-0.5 rounded-lg bg-rail p-1",
        className,
      )}
      aria-label={label}
    >
      {items.map((item) => {
        if (item.disabled) {
          const note =
            item.disabledNote === undefined ? "Coming soon" : item.disabledNote;
          return (
            <span
              key={item.label}
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm",
                item.active
                  ? "bg-surface font-medium text-foreground shadow-sm"
                  : "text-muted",
              )}
              aria-disabled="true"
              aria-current={item.active ? "page" : undefined}
            >
              {item.label}
              {note ? <span className="text-xs">{note}</span> : null}
            </span>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm",
              item.active
                ? "bg-surface font-medium text-foreground shadow-sm"
                : "text-muted hover:text-foreground",
            )}
            aria-current={item.active ? "page" : undefined}
          >
            {item.label}
            {item.badge ? (
              <span className="rounded-md bg-foreground px-1.5 text-xs font-semibold text-background">
                {item.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
