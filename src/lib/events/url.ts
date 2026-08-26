import type { EventListQuery, VenueListQuery } from "@/lib/events/schema";

export function eventsListHref(
  query: Partial<EventListQuery>,
  overrides: Partial<EventListQuery> = {},
): string {
  const merged = { ...query, ...overrides };
  const params = new URLSearchParams();

  if (merged.q) params.set("q", merged.q);
  if (merged.status) params.set("status", merged.status);
  if (merged.type) params.set("type", merged.type);
  if (merged.range && merged.range !== "all") params.set("range", merged.range);
  if (merged.from) params.set("from", merged.from);
  if (merged.to) params.set("to", merged.to);
  if (merged.page && merged.page > 1) params.set("page", String(merged.page));

  const qs = params.toString();
  return qs ? `/events?${qs}` : "/events";
}

export function venueSettingsHref(
  query: Partial<VenueListQuery>,
  overrides: Partial<VenueListQuery> = {},
): string {
  const merged = { ...query, ...overrides };
  const params = new URLSearchParams();

  if (merged.q) params.set("q", merged.q);
  if (merged.status) params.set("status", merged.status);
  if (merged.page && merged.page > 1) params.set("page", String(merged.page));

  const qs = params.toString();
  return qs ? `/settings/events?${qs}` : "/settings/events";
}
