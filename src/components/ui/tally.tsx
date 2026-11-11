import Link from "next/link";
import { cn } from "@/lib/cn";

export function Tally({
  columns,
  framed = true,
  className,
  children,
}: {
  columns: 3 | 5;
  framed?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "tally grid gap-px overflow-hidden bg-border",
        framed ? "rounded-xl border border-border" : "",
        columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2 xl:grid-cols-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function TallyCell({
  href,
  label,
  value,
  swatch,
  accent,
  action,
  actionVisible = false,
  valueClassName,
  children,
}: {
  href?: string;
  label: string;
  value: number;
  swatch?: string;
  /** Full-width colour strip along the top of the cell. */
  accent?: string;
  /** Named for screen readers when the whole cell is the link. */
  action?: string;
  /** Show the action as a visible line. The cell remains the link. */
  actionVisible?: boolean;
  valueClassName?: string;
  children?: React.ReactNode;
}) {
  const body = (
    <>
      {accent ? (
        <span className={cn("h-1 w-full", accent)} aria-hidden="true" />
      ) : null}
      <span className="flex min-h-0 flex-1 flex-col px-5 py-5">
        <span className="flex items-center gap-2 text-[0.8125rem] text-muted">
          {swatch ? (
            <span
              className={cn("size-2 shrink-0 rounded-full", swatch)}
              aria-hidden="true"
            />
          ) : null}
          {label}
        </span>
        <span
          className={cn(
            "mt-3 block text-[2.5rem] leading-none font-medium tracking-[-0.03em] text-foreground tabular-nums",
            valueClassName,
          )}
        >
          {value}
        </span>
        {children ? (
          <div className="mt-3 text-sm leading-5 text-muted">{children}</div>
        ) : null}
        {action ? (
          actionVisible ? (
            <span className="mt-auto pt-4 text-sm font-medium text-primary group-hover:underline">
              {action}
            </span>
          ) : (
            <span className="sr-only">{action}</span>
          )
        ) : null}
      </span>
    </>
  );
  const className =
    "group flex h-full min-w-0 flex-col bg-surface transition-colors hover:bg-wash";

  if (!href) {
    return <div className={className}>{body}</div>;
  }

  return (
    <Link href={href} className={className}>
      {body}
    </Link>
  );
}
