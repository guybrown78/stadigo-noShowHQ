import Link from "next/link";
import { cn } from "@/lib/cn";

export type Breadcrumb = {
  href?: string;
  label: string;
};

export function PageHeader({
  breadcrumbs,
  title,
  description,
  actions,
  children,
  className,
}: {
  breadcrumbs?: Breadcrumb[];
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(className)}>
      {breadcrumbs?.length ? (
        <nav className="text-sm text-slate-500" aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1">
            {breadcrumbs.map((crumb, index) => {
              const last = index === breadcrumbs.length - 1;
              return (
                <li key={`${crumb.label}-${index}`} className="flex items-center gap-1">
                  {index > 0 ? <span aria-hidden="true">/</span> : null}
                  {crumb.href && !last ? (
                    <Link href={crumb.href} className="hover:text-slate-800 hover:underline">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className={last ? "font-medium text-slate-700" : undefined}>
                      {crumb.label}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      ) : null}

      <div
        className={cn(
          "flex flex-wrap items-start justify-between gap-3",
          breadcrumbs?.length ? "mt-3" : undefined,
        )}
      >
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {title}
          </h1>
          {description ? (
            <div className="mt-1 max-w-2xl text-sm text-slate-600">
              {description}
            </div>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {children}
    </div>
  );
}
