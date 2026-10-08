import { formatLocalDateDisplay, formatLocalDateIso, parseLocalDate } from "@/lib/events/dates";

export const DASHBOARD_PRESETS = [
  { key: "last7", label: "Last 7 days" },
  { key: "last30", label: "Last 30 days" },
  { key: "month", label: "This month" },
  { key: "months3", label: "Last 3 months" },
] as const;

export type DashboardPreset = (typeof DASHBOARD_PRESETS)[number]["key"];
export type DashboardRangeKey = DashboardPreset | "custom";
export type DashboardGrain = "day" | "week" | "month";

export type DashboardBucket = {
  fromIso: string;
  toIso: string;
  label: string;
};

export type DashboardFilterState = {
  range: DashboardRangeKey;
  from: string;
  to: string;
  venueId: string;
  eventId: string;
};

export type DashboardRange = {
  key: DashboardRangeKey;
  from: Date;
  to: Date;
  fromIso: string;
  toIso: string;
  previousFrom: Date;
  previousTo: Date;
  previousFromIso: string;
  previousToIso: string;
  dayCount: number;
  grain: DashboardGrain;
};

export type DashboardQueryInput = {
  range?: string;
  from?: string;
  to?: string;
  venue?: string;
  event?: string;
};

export type DashboardQueryResult =
  | {
      ok: true;
      filters: DashboardFilterState;
      range: DashboardRange;
      buckets: DashboardBucket[];
    }
  | {
      ok: false;
      error: string;
      filters: DashboardFilterState;
    };

const PRESET_KEYS = new Set<string>(DASHBOARD_PRESETS.map((preset) => preset.key));

export function dashboardGrain(dayCount: number): DashboardGrain {
  if (dayCount <= 14) return "day";
  if (dayCount <= 90) return "week";
  return "month";
}

export function inclusiveDayCount(fromIso: string, toIso: string): number {
  const from = parseLocalDate(fromIso);
  const to = parseLocalDate(toIso);
  if (!from || !to) {
    return 0;
  }
  return Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
}

export function previousPeriod(
  fromIso: string,
  toIso: string,
): { fromIso: string; toIso: string } {
  const days = inclusiveDayCount(fromIso, toIso);
  const previousTo = addIsoDays(fromIso, -1);
  const previousFrom = addIsoDays(previousTo, -(days - 1));
  return { fromIso: previousFrom, toIso: previousTo };
}

export function formatDashboardSpan(fromIso: string, toIso: string): string {
  const from = parseLocalDate(fromIso);
  const to = parseLocalDate(toIso);
  if (!from || !to) {
    return "";
  }
  if (fromIso === toIso) {
    return formatLocalDateDisplay(from);
  }
  return `${formatLocalDateDisplay(from)} – ${formatLocalDateDisplay(to)}`;
}

/** Shorter span for cards. The year is written once when both dates share it. */
export function formatDashboardSpanCompact(fromIso: string, toIso: string): string {
  const from = parseLocalDate(fromIso);
  const to = parseLocalDate(toIso);
  if (!from || !to) {
    return "";
  }
  if (fromIso === toIso) {
    return formatLocalDateDisplay(from);
  }
  const fromParts = formatLocalDateDisplay(from).split(" ");
  const toParts = formatLocalDateDisplay(to).split(" ");
  if (fromParts[2] === toParts[2] && fromParts[1] === toParts[1]) {
    return `${fromParts[0]}–${toParts[0]} ${fromParts[1]} ${fromParts[2]}`;
  }
  if (fromParts[2] === toParts[2]) {
    return `${fromParts[0]} ${fromParts[1]} – ${toParts[0]} ${toParts[1]} ${toParts[2]}`;
  }
  return `${formatLocalDateDisplay(from)} – ${formatLocalDateDisplay(to)}`;
}

export function dashboardHref(filters: {
  range: DashboardRangeKey;
  from?: string;
  to?: string;
  venueId?: string;
  eventId?: string;
}): string {
  const params = new URLSearchParams();
  if (filters.range !== "last30") {
    params.set("range", filters.range);
  }
  if (filters.range === "custom") {
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
  }
  if (filters.venueId) params.set("venue", filters.venueId);
  if (filters.eventId) params.set("event", filters.eventId);
  const query = params.toString();
  return query ? `/dashboard?${query}` : "/dashboard";
}

export function resolveDashboardQuery(
  input: DashboardQueryInput,
  todayIso: string,
): DashboardQueryResult {
  const venueId = clean(input.venue);
  const eventId = clean(input.event);
  const from = clean(input.from);
  const to = clean(input.to);
  const rangeRaw = clean(input.range);
  const requested = { venueId, eventId, from, to };

  if (!parseLocalDate(todayIso)) {
    return invalid("Enter a valid date range.", {
      range: "custom",
      from,
      to,
      venueId,
      eventId,
    });
  }

  if (isPreset(rangeRaw)) {
    const bounds = presetBounds(rangeRaw, todayIso);
    const datesBlank = !from && !to;
    const datesMatch = from === bounds.fromIso && to === bounds.toIso;
    if (datesBlank || datesMatch) {
      return valid(rangeRaw, bounds, requested);
    }
    return resolveCustom(from, to, requested);
  }

  if (rangeRaw === "custom" || from || to) {
    return resolveCustom(from, to, requested);
  }

  return valid("last30", presetBounds("last30", todayIso), requested);
}

export function buildDashboardBuckets(
  fromIso: string,
  toIso: string,
): { grain: DashboardGrain; buckets: DashboardBucket[] } {
  const dayCount = inclusiveDayCount(fromIso, toIso);
  const grain = dashboardGrain(dayCount);
  const includeYear = fromIso.slice(0, 4) !== toIso.slice(0, 4);
  const buckets: DashboardBucket[] = [];
  let cursor = fromIso;

  while (cursor <= toIso) {
    let bucketTo = cursor;
    if (grain === "week") {
      bucketTo = addIsoDays(mondayOnOrBefore(cursor), 6);
    } else if (grain === "month") {
      bucketTo = endOfUtcMonth(cursor);
    }
    if (bucketTo > toIso) {
      bucketTo = toIso;
    }
    buckets.push({
      fromIso: cursor,
      toIso: bucketTo,
      label: bucketLabel(grain, cursor, bucketTo, includeYear),
    });
    const next = addIsoDays(bucketTo, 1);
    if (next <= cursor) {
      break;
    }
    cursor = next;
  }

  return { grain, buckets };
}

function resolveCustom(
  from: string,
  to: string,
  requested: { venueId: string; eventId: string; from: string; to: string },
): DashboardQueryResult {
  const filters: DashboardFilterState = {
    range: "custom",
    from,
    to,
    venueId: requested.venueId,
    eventId: requested.eventId,
  };
  if (!from || !to) {
    return invalid("Enter a start and end date.", filters);
  }
  if (!parseLocalDate(from) || !parseLocalDate(to)) {
    return invalid("Enter a valid date range.", filters);
  }
  if (from > to) {
    return invalid("The start date must be on or before the end date.", filters);
  }
  return valid("custom", { fromIso: from, toIso: to }, requested);
}

function valid(
  key: DashboardRangeKey,
  bounds: { fromIso: string; toIso: string },
  requested: { venueId: string; eventId: string },
): DashboardQueryResult {
  const previous = previousPeriod(bounds.fromIso, bounds.toIso);
  const built = buildDashboardBuckets(bounds.fromIso, bounds.toIso);
  const range: DashboardRange = {
    key,
    from: parseLocalDate(bounds.fromIso)!,
    to: parseLocalDate(bounds.toIso)!,
    fromIso: bounds.fromIso,
    toIso: bounds.toIso,
    previousFrom: parseLocalDate(previous.fromIso)!,
    previousTo: parseLocalDate(previous.toIso)!,
    previousFromIso: previous.fromIso,
    previousToIso: previous.toIso,
    dayCount: inclusiveDayCount(bounds.fromIso, bounds.toIso),
    grain: built.grain,
  };
  return {
    ok: true,
    filters: {
      range: key,
      from: bounds.fromIso,
      to: bounds.toIso,
      venueId: requested.venueId,
      eventId: requested.eventId,
    },
    range,
    buckets: built.buckets,
  };
}

function invalid(
  error: string,
  filters: DashboardFilterState,
): DashboardQueryResult {
  return { ok: false, error, filters };
}

function presetBounds(
  preset: DashboardPreset,
  todayIso: string,
): { fromIso: string; toIso: string } {
  if (preset === "last7") {
    return { fromIso: addIsoDays(todayIso, -6), toIso: todayIso };
  }
  if (preset === "last30") {
    return { fromIso: addIsoDays(todayIso, -29), toIso: todayIso };
  }
  if (preset === "month") {
    return { fromIso: `${todayIso.slice(0, 8)}01`, toIso: todayIso };
  }
  return { fromIso: addIsoMonths(todayIso, -3), toIso: todayIso };
}

function isPreset(value: string): value is DashboardPreset {
  return PRESET_KEYS.has(value);
}

function clean(value: string | undefined): string {
  return value?.trim() ?? "";
}

function addIsoDays(iso: string, days: number): string {
  const date = parseLocalDate(iso);
  if (!date) {
    return iso;
  }
  return formatLocalDateIso(new Date(date.getTime() + days * 86_400_000));
}

function addIsoMonths(iso: string, months: number): string {
  const date = parseLocalDate(iso);
  if (!date) {
    return iso;
  }
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return formatLocalDateIso(
    new Date(
      Date.UTC(
        target.getUTCFullYear(),
        target.getUTCMonth(),
        Math.min(date.getUTCDate(), lastDay),
      ),
    ),
  );
}

function endOfUtcMonth(iso: string): string {
  const date = parseLocalDate(iso);
  if (!date) {
    return iso;
  }
  return formatLocalDateIso(
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)),
  );
}

function mondayOnOrBefore(iso: string): string {
  const date = parseLocalDate(iso);
  if (!date) {
    return iso;
  }
  const day = date.getUTCDay();
  const delta = day === 0 ? 6 : day - 1;
  return addIsoDays(iso, -delta);
}

function bucketLabel(
  grain: DashboardGrain,
  fromIso: string,
  toIso: string,
  includeYear: boolean,
): string {
  if (grain === "month") {
    const full = formatLocalDateDisplay(parseLocalDate(fromIso)!);
    const parts = full.split(" ");
    return `${parts[1]} ${parts[2]}`;
  }
  if (grain === "day" || fromIso === toIso) {
    return compactDate(fromIso, includeYear);
  }
  return weekLabel(fromIso, toIso);
}

function compactDate(iso: string, includeYear: boolean): string {
  const full = formatLocalDateDisplay(parseLocalDate(iso)!);
  if (includeYear) {
    return full;
  }
  return full.slice(0, full.lastIndexOf(" "));
}

function weekLabel(fromIso: string, toIso: string): string {
  const fromFull = formatLocalDateDisplay(parseLocalDate(fromIso)!);
  const toFull = formatLocalDateDisplay(parseLocalDate(toIso)!);
  const fromParts = fromFull.split(" ");
  const toParts = toFull.split(" ");
  const sameYear = fromParts[2] === toParts[2];
  const sameMonth = sameYear && fromParts[1] === toParts[1];
  if (sameMonth) {
    return `${fromParts[0]}–${toParts[0]} ${fromParts[1]}`;
  }
  if (sameYear) {
    return `${fromParts[0]} ${fromParts[1]}–${toParts[0]} ${toParts[1]}`;
  }
  return `${fromFull}–${toFull}`;
}
