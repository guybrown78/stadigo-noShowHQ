import {
  DEFAULT_LEDGER_DIRECTION,
  DEFAULT_LEDGER_VIEW,
  defaultLedgerSortForView,
  isLedgerSortAllowed,
  ledgerFilterApplies,
  type LedgerView,
} from "@/lib/absence/catalog";
import type { LedgerListQuery } from "@/lib/absence/schema";

function resolvedAffected(
  query: Partial<LedgerListQuery>,
  bound: "from" | "to",
): string {
  if (bound === "from") {
    return query.affectedFrom || query.eventFrom || query.firstDayFrom || "";
  }
  return query.affectedTo || query.eventTo || query.firstDayTo || "";
}

export function ledgerListHref(
  query: Partial<LedgerListQuery>,
  overrides: Partial<LedgerListQuery> = {},
): string {
  const merged = { ...query, ...overrides };
  const params = new URLSearchParams();
  const view = merged.view ?? DEFAULT_LEDGER_VIEW;
  const defaultSort = defaultLedgerSortForView(view);
  const affectedFrom = resolvedAffected(merged, "from");
  const affectedTo = resolvedAffected(merged, "to");

  if (view !== DEFAULT_LEDGER_VIEW) {
    params.set("view", view);
  }
  if (merged.q) params.set("q", merged.q);
  if (ledgerFilterApplies(view, "venue") && merged.venue) {
    params.set("venue", merged.venue);
  }
  if (ledgerFilterApplies(view, "eventType") && merged.eventType) {
    params.set("eventType", merged.eventType);
  }
  if (merged.reportedFrom) params.set("reportedFrom", merged.reportedFrom);
  if (merged.reportedTo) params.set("reportedTo", merged.reportedTo);
  if (affectedFrom) params.set("affectedFrom", affectedFrom);
  if (affectedTo) params.set("affectedTo", affectedTo);
  if (merged.includeArchived) params.set("includeArchived", "1");

  const sort = merged.sort ?? defaultSort;
  const direction = merged.direction ?? DEFAULT_LEDGER_DIRECTION;
  if (sort !== defaultSort || direction !== DEFAULT_LEDGER_DIRECTION) {
    params.set("sort", sort);
    params.set("direction", direction);
  }

  if (merged.page && merged.page > 1) params.set("page", String(merged.page));

  const qs = params.toString();
  return qs ? `/ledger?${qs}` : "/ledger";
}

export function ledgerViewHref(
  query: LedgerListQuery,
  view: LedgerView,
): string {
  const sortAllowed = isLedgerSortAllowed(view, query.sort);
  return ledgerListHref(query, {
    view,
    page: 1,
    venue: ledgerFilterApplies(view, "venue") ? query.venue : "",
    eventType: ledgerFilterApplies(view, "eventType") ? query.eventType : "",
    sort: sortAllowed ? query.sort : defaultLedgerSortForView(view),
    direction: sortAllowed ? query.direction : DEFAULT_LEDGER_DIRECTION,
  });
}

export function ledgerLogAbsenceHref(view: LedgerView): string {
  if (view === "awol") {
    return "/absence/new?type=awol";
  }
  if (view === "sickness") {
    return "/absence/new?type=sickness";
  }
  return "/absence/new";
}

export function parseAbsenceReturnOrigin(
  value: string | undefined,
): "staff" | null {
  return value === "staff" ? "staff" : null;
}

export function absenceCancelHref(params: {
  origin: "staff" | null;
  staffId: string | null;
}): string {
  if (params.origin === "staff" && params.staffId) {
    return `/staff/${params.staffId}`;
  }
  return "/dashboard";
}
