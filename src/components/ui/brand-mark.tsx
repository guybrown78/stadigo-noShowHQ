import { Zap } from "lucide-react";
import { cn } from "@/lib/cn";

export function BrandMark({
  title = "NoShowHQ",
  className,
  size = "md",
}: {
  title?: string;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-full bg-primary text-white",
          size === "sm" ? "size-7" : "size-8",
        )}
        aria-hidden="true"
      >
        <Zap className={size === "sm" ? "size-3.5" : "size-4"} />
      </span>
      <span
        className={cn(
          "font-semibold tracking-tight text-slate-900",
          size === "sm" ? "text-base" : "text-lg",
        )}
      >
        {title}
      </span>
    </span>
  );
}
