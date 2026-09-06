import { cn } from "@/lib/cn";

export function initialsFor(firstName: string, lastName: string) {
  const first = firstName.trim().charAt(0);
  const last = lastName.trim().charAt(0);
  return `${first}${last}`.toUpperCase() || "?";
}

const sizeClass = {
  sm: "h-8 w-8 text-[11px]",
  md: "h-9 w-9 text-xs",
  lg: "h-12 w-12 text-sm",
};

export function Avatar({
  initials,
  size = "md",
  className,
}: {
  initials: string;
  size?: keyof typeof sizeClass;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-primary-soft font-semibold tracking-wide text-primary-hover",
        sizeClass[size],
        className,
      )}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}
