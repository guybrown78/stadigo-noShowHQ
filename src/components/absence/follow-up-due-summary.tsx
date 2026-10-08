import Link from "next/link";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { FOLLOW_UP_DUE_LABELS } from "@/lib/absence/follow-up";
import { followUpQueueHref } from "@/lib/absence/follow-up-url";

export function FollowUpDueSummary({
  counts,
  className,
}: {
  counts: { overdue: number; dueToday: number; upcoming: number };
  className?: string;
}) {
  const groups = [
    {
      key: "overdue" as const,
      count: counts.overdue,
      href: followUpQueueHref({ due: "overdue" }),
    },
    {
      key: "dueToday" as const,
      count: counts.dueToday,
      href: followUpQueueHref({ due: "dueToday" }),
    },
    {
      key: "upcoming" as const,
      count: counts.upcoming,
      href: followUpQueueHref({ due: "upcoming" }),
    },
  ];

  return (
    <section className={cn("mt-8", className)} aria-labelledby="follow-up-summary-heading">
      <h2
        id="follow-up-summary-heading"
        className="text-base font-semibold text-slate-900"
      >
        Open follow-ups
      </h2>
      <ul className="mt-4 grid gap-3 sm:grid-cols-3">
        {groups.map((group) => (
          <li key={group.key}>
            <Link href={group.href} className="block h-full">
              <Card className="h-full p-4 shadow-none hover:border-slate-300">
                <p className="text-sm text-slate-600">
                  {FOLLOW_UP_DUE_LABELS[group.key]}
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {group.count}
                </p>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
