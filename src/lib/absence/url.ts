import {
  DEFAULT_AWOL_LEDGER_SORT,
  DEFAULT_LEDGER_DIRECTION,
  DEFAULT_LEDGER_SORT,
} from "@/lib/absence/catalog";
import type { LedgerListQuery } from "@/lib/absence/schema";

export function ledgerListHref(
  query: Partial<LedgerListQuery>,
  overrides: Partial<LedgerListQuery> = {},
): string {
  const merged = { ...query, ...overrides };
  const params = new URLSearchParams();
  const view = merged.view ?? "cancellations";
  const defaultSort =
    view === "awol" ? DEFAULT_AWOL_LEDGER_SORT : DEFAULT_LEDGER_SORT;

  if (view === "awol") params.set("view", "awol");
  if (merged.q) params.set("q", merged.q);
  if (merged.venue) params.set("venue", merged.venue);
  if (merged.eventType) params.set("eventType", merged.eventType);
  if (merged.reportedFrom) params.set("reportedFrom", merged.reportedFrom);
  if (merged.reportedTo) params.set("reportedTo", merged.reportedTo);
  if (view === "awol") {
    if (merged.eventFrom) params.set("eventFrom", merged.eventFrom);
    if (merged.eventTo) params.set("eventTo", merged.eventTo);
  }

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
