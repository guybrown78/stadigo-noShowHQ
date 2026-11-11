import { Tally, TallyCell } from "@/components/ui/tally";
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
      valueClassName: counts.overdue > 0 ? "text-cancel" : undefined,
    },
    {
      key: "dueToday" as const,
      count: counts.dueToday,
      href: followUpQueueHref({ due: "dueToday" }),
      valueClassName: counts.dueToday > 0 ? "text-awol-ink" : undefined,
    },
    {
      key: "upcoming" as const,
      count: counts.upcoming,
      href: followUpQueueHref({ due: "upcoming" }),
      valueClassName: undefined,
    },
  ];

  return (
    <section className={cn("mt-8", className)} aria-labelledby="follow-up-summary-heading">
      <h2
        id="follow-up-summary-heading"
        className="mb-3 text-sm font-medium text-foreground"
      >
        Open follow-ups
      </h2>
      <Tally columns={3}>
        {groups.map((group) => (
          <TallyCell
            key={group.key}
            href={group.href}
            label={FOLLOW_UP_DUE_LABELS[group.key]}
            value={group.count}
            valueClassName={group.valueClassName}
            action="Open the queue"
          />
        ))}
      </Tally>
    </section>
  );
}
