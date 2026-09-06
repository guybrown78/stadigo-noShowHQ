import { cn } from "@/lib/cn";

export function labelClassName(className?: string) {
  return cn("mb-1 block text-sm font-medium text-slate-700", className);
}

export function FieldLabel({
  htmlFor,
  required,
  children,
  className,
  size = "md",
}: {
  htmlFor?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
  size?: "md" | "sm";
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn(
        size === "sm"
          ? "mb-0.5 block text-xs font-medium text-slate-500"
          : "mb-1 block text-sm font-medium text-slate-700",
        className,
      )}
    >
      {children}
      {required ? <span className="text-red-700"> *</span> : null}
    </label>
  );
}
