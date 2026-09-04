import {
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

  if (merged.q) params.set("q", merged.q);
  if (merged.venue) params.set("venue", merged.venue);
  if (merged.eventType) params.set("eventType", merged.eventType);
  if (merged.reportedFrom) params.set("reportedFrom", merged.reportedFrom);
  if (merged.reportedTo) params.set("reportedTo", merged.reportedTo);

  const sort = merged.sort ?? DEFAULT_LEDGER_SORT;
  const direction = merged.direction ?? DEFAULT_LEDGER_DIRECTION;
  if (sort !== DEFAULT_LEDGER_SORT || direction !== DEFAULT_LEDGER_DIRECTION) {
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
