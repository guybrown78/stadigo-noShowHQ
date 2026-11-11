"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { FieldLabel } from "@/components/ui/field";

export function FilterBar({
  children,
  actions,
  ariaLabel,
  active = false,
  className,
}: {
  children: React.ReactNode;
  actions?: React.ReactNode;
  ariaLabel: string;
  /** When true, the mobile toggle shows that filters are applied. */
  active?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className={className}>
      <button
        type="button"
        className="flex w-full items-center gap-2 py-1 text-left md:hidden"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="text-sm font-medium text-foreground">Filters</span>
        {active ? (
          <span className="rounded-md bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary-hover">
            Applied
          </span>
        ) : null}
        <ChevronDown
          className={cn(
            "ml-auto size-4 shrink-0 text-muted transition-transform",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>
      <div
        id={panelId}
        role="search"
        aria-label={ariaLabel}
        className={cn(
          "flex flex-wrap items-end gap-x-3 gap-y-3",
          open ? "mt-3 md:mt-0" : "hidden md:flex",
        )}
      >
        {children}
        {actions ? (
          <div className="flex shrink-0 items-end gap-2 pb-px">{actions}</div>
        ) : null}
      </div>
    </div>
  );
}

export function FilterField({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-[9.5rem] flex-1", className)}>
      <FieldLabel htmlFor={htmlFor} size="sm">
        {label}
      </FieldLabel>
      {children}
    </div>
  );
}
