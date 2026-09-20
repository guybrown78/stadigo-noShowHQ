import { Badge } from "@/components/ui/badge";
import { SegmentedNav } from "@/components/ui/segmented-nav";
import type { LedgerView } from "@/lib/absence/catalog";
import type { LedgerListQuery } from "@/lib/absence/schema";
import { ledgerViewHref } from "@/lib/absence/url";

function activeCountLabel(view: LedgerView, activeCount: number): string {
  if (view === "awol") {
    return activeCount === 1 ? "active AWOL" : "active AWOLs";
  }
  if (view === "sickness") {
    return activeCount === 1
      ? "active Sickness report"
      : "active Sickness reports";
  }
  if (view === "cancellations") {
    return activeCount === 1 ? "active Cancellation" : "active Cancellations";
  }
  return activeCount === 1 ? "active absence" : "active absences";
}

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
        {activeCount} {activeCountLabel(view, activeCount)}
      </Badge>
    </div>
  );
}
