import { cn } from "@/lib/cn";

export type BadgeTone =
  | "neutral"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "cancel"
  | "awol"
  | "sickness";

const toneClass: Record<BadgeTone, string> = {
  neutral: "bg-slate-100 text-slate-700",
  primary: "bg-primary-soft text-primary-hover",
  success: "bg-emerald-100 text-emerald-900",
  warning: "bg-amber-100 text-amber-900",
  danger: "bg-red-100 text-red-800",
  info: "bg-sky-100 text-sky-900",
  cancel: "bg-cancel-soft text-cancel",
  awol: "bg-awol-soft text-awol",
  sickness: "bg-sickness-soft text-sickness",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        toneClass[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
