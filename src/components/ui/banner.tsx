import { cn } from "@/lib/cn";

const toneClass = {
  success: "border-primary/20 bg-primary-soft text-primary-hover",
  warning: "border-amber-200 bg-amber-50 text-amber-950",
  neutral: "border-border bg-wash text-foreground",
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
        "rounded-lg border px-3 py-2 text-sm leading-6",
        toneClass[tone],
        className,
      )}
      role="status"
    >
      {children}
    </p>
  );
}
