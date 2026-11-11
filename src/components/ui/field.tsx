import { cn } from "@/lib/cn";

export function labelClassName(className?: string) {
  return cn("mb-1 block text-sm font-medium text-foreground", className);
}

export function FieldLabel({
  htmlFor,
  id,
  required,
  children,
  className,
  size = "md",
}: {
  htmlFor?: string;
  id?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
  size?: "md" | "sm";
}) {
  return (
    <label
      id={id}
      htmlFor={htmlFor}
      className={cn(
        size === "sm"
          ? "mb-0.5 block text-xs font-medium text-muted"
          : "mb-1 block text-sm font-medium text-foreground",
        className,
      )}
    >
      {children}
      {required ? <span className="text-red-700"> *</span> : null}
    </label>
  );
}
