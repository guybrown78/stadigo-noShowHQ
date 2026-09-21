import { Badge } from "@/components/ui/badge";
import { SegmentedNav } from "@/components/ui/segmented-nav";
import type { LedgerListQuery } from "@/lib/absence/schema";
import { ledgerActiveCountPhrase } from "@/lib/absence/display";
import { ledgerViewHref } from "@/lib/absence/url";

export function LedgerTypeNav({
  query,
  activeCount,
}: {
  query: LedgerListQuery;
  activeCount: number;
}) {
  const view = query.view;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <SegmentedNav
        label="Absence type"
        items={[
          {
            href: ledgerViewHref(query, "all"),
            label: "All absences",
            active: view === "all",
          },
          {
            href: ledgerViewHref(query, "cancellations"),
            label: "Cancellations",
            active: view === "cancellations",
          },
          {
            href: ledgerViewHref(query, "awol"),
            label: "AWOL",
            active: view === "awol",
          },
          {
            href: ledgerViewHref(query, "sickness"),
            label: "Sickness",
            active: view === "sickness",
          },
        ]}
      />
      <Badge tone="neutral">
        {activeCount} {ledgerActiveCountPhrase(view, activeCount)}
      </Badge>
    </div>
  );
}
