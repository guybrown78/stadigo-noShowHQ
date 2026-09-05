import { cn } from "@/lib/cn";

const toneClass = {
  success: "border-primary/20 bg-primary-soft text-primary-hover",
  warning: "border-amber-200 bg-amber-50 text-amber-950",
  neutral: "border-slate-300 bg-slate-50 text-slate-800",
};

export function Banner({
  tone = "neutral",
  children,
  className,
}: {
  tone?: keyof typeof toneClass;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "rounded-md border px-3 py-2 text-sm",
        toneClass[tone],
        className,
      )}
      role="status"
    >
      {children}
    </p>
  );
}
