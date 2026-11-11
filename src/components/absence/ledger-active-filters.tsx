import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { SICKNESS_EVIDENCE_FILTERS } from "@/lib/absence/catalog";
import {
  LEDGER_EVIDENCE_FILTER_LABELS,
  LEDGER_SICKNESS_HIDDEN_BY_EVENT_FILTERS,
  LEDGER_SICKNESS_HIDDEN_BY_EVENT_TYPE,
  LEDGER_SICKNESS_HIDDEN_BY_VENUE,
} from "@/lib/absence/display";
import {
  isLedgerAffectedDateRangeInvalid,
  isLedgerDateRangeInvalid,
  resolvedLedgerAffectedFrom,
  resolvedLedgerAffectedTo,
  type LedgerListQuery,
} from "@/lib/absence/schema";
import { ledgerClearFiltersHref, ledgerListHref } from "@/lib/absence/url";

type Chip = {
  key: string;
  label: string;
  href: string;
  removeLabel: string;
};

function dropHref(
  query: LedgerListQuery,
  overrides: Partial<LedgerListQuery>,
) {
  return ledgerListHref(query, { ...overrides, page: 1, detail: "" });
}

export function LedgerActiveFilters({
  query,
  periodLabel,
  venueName,
  eventTypeName,
  showClear,
}: {
  query: LedgerListQuery;
  periodLabel: string;
  venueName: string;
  eventTypeName: string;
  showClear: boolean;
}) {
  const chips: Chip[] = [];
  if (query.q) {
    chips.push({
      key: "q",
      label: `Search · ${query.q}`,
      href: dropHref(query, { q: "" }),
      removeLabel: `Remove search ${query.q}`,
    });
  }
  if (periodLabel) {
    chips.push({
      key: "period",
      label: `Pay period · ${periodLabel}`,
      href: dropHref(query, { period: "" }),
      removeLabel: `Remove pay period ${periodLabel}`,
    });
  }
  if (venueName) {
    chips.push({
      key: "venue",
      label: `Venue · ${venueName}`,
      href: dropHref(query, { venue: "" }),
      removeLabel: `Remove venue ${venueName}`,
    });
  }
  if (eventTypeName) {
    chips.push({
      key: "eventType",
      label: `Event type · ${eventTypeName}`,
      href: dropHref(query, { eventType: "" }),
      removeLabel: `Remove event type ${eventTypeName}`,
    });
  }
  if (
    !isLedgerDateRangeInvalid(query) &&
    (query.reportedFrom || query.reportedTo)
  ) {
    const label = `Recorded ${query.reportedFrom || "…"}–${query.reportedTo || "…"}`;
    chips.push({
      key: "reported",
      label,
      href: dropHref(query, { reportedFrom: "", reportedTo: "" }),
      removeLabel: `Remove ${label}`,
    });
  }
  const affectedFrom = resolvedLedgerAffectedFrom(query);
  const affectedTo = resolvedLedgerAffectedTo(query);
  if (!isLedgerAffectedDateRangeInvalid(query) && (affectedFrom || affectedTo)) {
    const label = `Affected ${affectedFrom || "…"}–${affectedTo || "…"}`;
    chips.push({
      key: "affected",
      label,
      href: dropHref(query, {
        affectedFrom: "",
        affectedTo: "",
        eventFrom: "",
        eventTo: "",
        firstDayFrom: "",
        firstDayTo: "",
      }),
      removeLabel: `Remove ${label}`,
    });
  }
  if (query.includeArchived) {
    chips.push({
      key: "archived",
      label: "Active and archived",
      href: dropHref(query, { includeArchived: false }),
      removeLabel: "Remove active and archived",
    });
  }
  if (query.view === "cancellations" && query.unauthorised) {
    chips.push({
      key: "unauthorised",
      label: "Unauthorised only",
      href: dropHref(query, { unauthorised: false }),
      removeLabel: "Remove unauthorised only",
    });
  }
  if (query.view === "sickness" && query.evidenceStatus) {
    const known = (
      SICKNESS_EVIDENCE_FILTERS as readonly string[]
    ).includes(query.evidenceStatus)
      ? LEDGER_EVIDENCE_FILTER_LABELS[
          query.evidenceStatus as keyof typeof LEDGER_EVIDENCE_FILTER_LABELS
        ]
      : query.evidenceStatus;
    const label = `Fit note · ${known}`;
    chips.push({
      key: "evidence",
      label,
      href: dropHref(query, { evidenceStatus: "" }),
      removeLabel: `Remove ${label}`,
    });
  }

  const hidesSickness =
    query.view === "all" && Boolean(venueName || eventTypeName);
  const sicknessNote =
    venueName && eventTypeName
      ? LEDGER_SICKNESS_HIDDEN_BY_EVENT_FILTERS
      : venueName
        ? LEDGER_SICKNESS_HIDDEN_BY_VENUE
        : eventTypeName
          ? LEDGER_SICKNESS_HIDDEN_BY_EVENT_TYPE
          : "";

  if (chips.length === 0 && !showClear) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {chips.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Active filters">
          {chips.map((chip) => (
            <li key={chip.key}>
              <Link
                href={chip.href}
                aria-label={chip.removeLabel}
                className="inline-flex items-center gap-1 rounded-full bg-primary-soft py-1 pr-2 pl-3 text-sm font-medium text-primary-hover hover:underline"
              >
                <span>{chip.label}</span>
                <span aria-hidden="true">×</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {showClear ? (
        <ButtonLink
          href={ledgerClearFiltersHref(query)}
          variant="secondary"
          size="sm"
        >
          Clear filters
        </ButtonLink>
      ) : null}
      {hidesSickness ? (
        <p className="basis-full text-xs text-muted">{sicknessNote}</p>
      ) : null}
    </div>
  );
}
