import type { FollowUpQueueQuery } from "@/lib/absence/follow-up-schema";

function applyQuery(
  params: URLSearchParams,
  query: Partial<FollowUpQueueQuery>,
) {
  if (query.q) params.set("q", query.q);
  if (query.type) params.set("type", query.type);
  if (query.due) params.set("due", query.due);
  if (query.page && query.page > 1) params.set("page", String(query.page));
  if (query.detail) params.set("detail", query.detail);
}

export function followUpQueueHref(
  query: Partial<FollowUpQueueQuery>,
  overrides: Partial<FollowUpQueueQuery> = {},
): string {
  const merged = { ...query, ...overrides };
  const params = new URLSearchParams();
  applyQuery(params, merged);
  const qs = params.toString();
  return qs ? `/follow-ups?${qs}` : "/follow-ups";
}

export function followUpDetailHref(
  query: FollowUpQueueQuery,
  absenceId: string,
): string {
  return followUpQueueHref(query, { detail: absenceId });
}

export function followUpCloseDetailHref(query: FollowUpQueueQuery): string {
  return followUpQueueHref(query, { detail: "" });
}

export function followUpActionReturnHref(href: string): string {
  return href.includes("?") ? `${href}&followUp=1` : `${href}?followUp=1`;
}

export function evidenceActionReturnHref(href: string): string {
  return href.includes("?") ? `${href}&evidence=1` : `${href}?evidence=1`;
}

export function returnToWorkActionReturnHref(href: string): string {
  return href.includes("?") ? `${href}&returnToWork=1` : `${href}?returnToWork=1`;
}

const ALLOWED_PATH = /^\/(?:follow-ups|ledger|absence\/[A-Za-z0-9]+)$/;

export function safeFollowUpReturnTo(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/")) {
    return null;
  }
  if (
    value.startsWith("//") ||
    value.includes("\\") ||
    value.includes("://")
  ) {
    return null;
  }
  try {
    const url = new URL(value, "http://noshowhq.local");
    if (!ALLOWED_PATH.test(url.pathname)) {
      return null;
    }
    if (url.username || url.password || url.host !== "noshowhq.local") {
      return null;
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}
