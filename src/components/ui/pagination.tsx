import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

export function Pagination({
  page,
  pageCount,
  total,
  from,
  to,
  itemLabel,
  hrefForPage,
  className,
}: {
  page: number;
  pageCount: number;
  total: number;
  from: number;
  to: number;
  itemLabel: string;
  hrefForPage: (page: number) => string;
  className?: string;
}) {
  if (pageCount <= 1) {
    return null;
  }

  const pages = visiblePages(page, pageCount);

  return (
    <nav
      className={cn(
        "flex flex-wrap items-center justify-between gap-3",
        className,
      )}
      aria-label="Pagination"
    >
      <p className="text-sm text-slate-600">
        Showing {from}–{to} of {total} {itemLabel}
      </p>
      <ol className="flex items-center gap-1">
        <li>
          {page > 1 ? (
            <Link
              href={hrefForPage(page - 1)}
              className={pageButtonClass()}
              aria-label={`Previous page of ${itemLabel}`}
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </Link>
          ) : (
            <span className={pageButtonClass(false, true)}>
              <ChevronLeft className="size-4" aria-hidden="true" />
            </span>
          )}
        </li>
        {pages.map((entry, index) =>
          entry === "ellipsis" ? (
            <li
              key={`ellipsis-${index}`}
              className="px-1 text-sm text-slate-400"
              aria-hidden="true"
            >
              …
            </li>
          ) : (
            <li key={entry}>
              <Link
                href={hrefForPage(entry)}
                className={pageButtonClass(entry === page)}
                aria-current={entry === page ? "page" : undefined}
                aria-label={`Page ${entry}`}
              >
                {entry}
              </Link>
            </li>
          ),
        )}
        <li>
          {page < pageCount ? (
            <Link
              href={hrefForPage(page + 1)}
              className={pageButtonClass()}
              aria-label={`Next page of ${itemLabel}`}
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </Link>
          ) : (
            <span className={pageButtonClass(false, true)}>
              <ChevronRight className="size-4" aria-hidden="true" />
            </span>
          )}
        </li>
      </ol>
    </nav>
  );
}

function pageButtonClass(active = false, disabled = false) {
  return cn(
    "inline-flex size-9 items-center justify-center rounded-md text-sm font-medium",
    active && "bg-primary text-white",
    !active &&
      !disabled &&
      "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
    disabled && "border border-slate-200 text-slate-300",
  );
}

function visiblePages(page: number, pageCount: number): Array<number | "ellipsis"> {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const items = new Set<number>([1, pageCount, page, page - 1, page + 1]);
  const sorted = [...items].filter((value) => value >= 1 && value <= pageCount).sort(
    (a, b) => a - b,
  );
  const result: Array<number | "ellipsis"> = [];
  for (const value of sorted) {
    const prev = result[result.length - 1];
    if (typeof prev === "number" && value - prev > 1) {
      result.push("ellipsis");
    }
    result.push(value);
  }
  return result;
}
