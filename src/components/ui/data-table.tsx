import { cn } from "@/lib/cn";

export function DataTable({
  children,
  className,
  stickyHeader = false,
}: {
  children: React.ReactNode;
  className?: string;
  /** Lets the header stick to the page. Overflow hidden would trap it. */
  stickyHeader?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-surface shadow-sm",
        stickyHeader ? "overflow-visible" : "overflow-hidden",
        className,
      )}
    >
      <table className="min-w-full text-left text-sm">{children}</table>
    </div>
  );
}

export function DataTableHead({
  children,
  sticky = false,
}: {
  children: React.ReactNode;
  sticky?: boolean;
}) {
  return (
    <thead
      className={cn(
        "border-b border-border bg-slate-50 text-slate-600",
        sticky &&
          "sticky top-0 z-10 [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-slate-50",
      )}
    >
      {children}
    </thead>
  );
}
