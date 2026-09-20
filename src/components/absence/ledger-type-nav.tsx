import { Badge } from "@/components/ui/badge";
import { SegmentedNav } from "@/components/ui/segmented-nav";
import type { LedgerView } from "@/lib/absence/catalog";

function activeCountLabel(view: LedgerView, activeCount: number): string {
  if (view === "awol") {
    return activeCount === 1 ? "active AWOL" : "active AWOLs";
  }
  if (view === "sickness") {
    return activeCount === 1
      ? "active Sickness report"
      : "active Sickness reports";
  }
  return activeCount === 1 ? "active Cancellation" : "active Cancellations";
}

export function LedgerTypeNav({
  view,
  activeCount,
}: {
  view: LedgerView;
  activeCount: number;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <SegmentedNav
        label="Absence type"
        items={[
          {
            href: "/ledger",
            label: "Cancellations",
            active: view === "cancellations",
          },
          {
            href: "/ledger?view=awol",
            label: "AWOL",
            active: view === "awol",
          },
          {
            href: "/ledger?view=sickness",
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
