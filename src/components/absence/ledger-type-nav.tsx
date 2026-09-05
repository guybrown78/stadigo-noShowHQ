import { Badge } from "@/components/ui/badge";
import { SegmentedNav } from "@/components/ui/segmented-nav";

export function LedgerTypeNav({ activeCount }: { activeCount: number }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <SegmentedNav
        label="Absence type"
        items={[
          { href: "/ledger", label: "Cancellations", active: true },
          { href: "/ledger", label: "AWOL", disabled: true },
          { href: "/ledger", label: "Sickness", disabled: true },
        ]}
      />
      <Badge tone="neutral">
        {activeCount}{" "}
        {activeCount === 1 ? "active Cancellation" : "active Cancellations"}
      </Badge>
    </div>
  );
}
