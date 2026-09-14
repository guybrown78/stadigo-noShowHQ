import { Badge } from "@/components/ui/badge";
import { SegmentedNav } from "@/components/ui/segmented-nav";
import type { LedgerView } from "@/lib/absence/catalog";

export function LedgerTypeNav({
  view,
  activeCount,
}: {
  view: LedgerView;
  activeCount: number;
}) {
  const awol = view === "awol";
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <SegmentedNav
        label="Absence type"
        items={[
          {
            href: "/ledger",
            label: "Cancellations",
            active: !awol,
          },
          {
            href: "/ledger?view=awol",
            label: "AWOL",
            active: awol,
          },
          { href: "/ledger", label: "Sickness", disabled: true },
        ]}
      />
      <Badge tone="neutral">
        {activeCount}{" "}
        {awol
          ? activeCount === 1
            ? "active AWOL"
            : "active AWOLs"
          : activeCount === 1
            ? "active Cancellation"
            : "active Cancellations"}
      </Badge>
    </div>
  );
}
