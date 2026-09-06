import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/card";

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "border-dashed px-6 py-12 text-center shadow-none",
        className,
      )}
    >
      <p className="text-sm font-medium text-slate-800">{title}</p>
      {description ? (
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </Card>
  );
}
