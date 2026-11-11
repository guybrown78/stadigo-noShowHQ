import { SegmentedNav } from "@/components/ui/segmented-nav";
import { SICKNESS_EVIDENCE_FILTERS } from "@/lib/absence/catalog";
import { LEDGER_EVIDENCE_FILTER_LABELS } from "@/lib/absence/display";
import type { LedgerListQuery } from "@/lib/absence/schema";
import { ledgerListHref } from "@/lib/absence/url";

function choiceHref(
  query: LedgerListQuery,
  overrides: Partial<LedgerListQuery>,
) {
  return ledgerListHref(query, { ...overrides, page: 1, detail: "" });
}

export function LedgerQuickFilters({ query }: { query: LedgerListQuery }) {
  return (
    <div className="mt-4 flex flex-col gap-2">
      <SegmentedNav
        label="Record status"
        items={[
          {
            href: choiceHref(query, { includeArchived: false }),
            label: "Active",
            active: !query.includeArchived,
          },
          {
            href: choiceHref(query, { includeArchived: true }),
            label: "Active and archived",
            active: query.includeArchived,
          },
        ]}
      />
      {query.view === "cancellations" ? (
        <SegmentedNav
          label="Authorisation"
          items={[
            {
              href: choiceHref(query, { unauthorised: false }),
              label: "All",
              active: !query.unauthorised,
            },
            {
              href: choiceHref(query, { unauthorised: true }),
              label: "Unauthorised only",
              active: query.unauthorised,
            },
          ]}
        />
      ) : null}
      {query.view === "sickness" ? (
        <SegmentedNav
          label="Fit note evidence"
          items={[
            {
              href: choiceHref(query, { evidenceStatus: "" }),
              label: "All sickness reports",
              active: query.evidenceStatus.length === 0,
            },
            ...SICKNESS_EVIDENCE_FILTERS.map((value) => ({
              href: choiceHref(query, { evidenceStatus: value }),
              label: LEDGER_EVIDENCE_FILTER_LABELS[value],
              active: query.evidenceStatus === value,
            })),
          ]}
        />
      ) : null}
    </div>
  );
}
