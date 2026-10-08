import { Button, ButtonLink } from "@/components/ui/button";
import { FilterBar, FilterField } from "@/components/ui/filter-bar";
import { SegmentedNav } from "@/components/ui/segmented-nav";
import { filterControlClassName } from "@/components/form";
import type { DashboardEventOption } from "@/lib/absence/dashboard-query";
import {
  DASHBOARD_PRESETS,
  dashboardHref,
  formatDashboardSpan,
  type DashboardQueryResult,
} from "@/lib/absence/dashboard-range";
import { formatLocalDateDisplay, parseLocalDate } from "@/lib/events/dates";

export function DashboardFilters({
  result,
  venueId,
  eventId,
  venues,
  events,
}: {
  result: DashboardQueryResult;
  venueId: string;
  eventId: string;
  venues: { id: string; name: string }[];
  events: DashboardEventOption[];
}) {
  const rangeKey = result.ok ? result.filters.range : "custom";
  const datesInvalid = !result.ok;
  const venue = venues.find((item) => item.id === venueId);
  const event = events.find((item) => item.id === eventId);
  const filtersActive =
    Boolean(venueId || eventId) || rangeKey !== "last30" || datesInvalid;
  const eventLabel = event ? eventOptionLabel(event) : "All events";

  return (
    <div className="mt-6">
      <SegmentedNav
        label="Date range"
        items={DASHBOARD_PRESETS.map((preset) => ({
          href: dashboardHref({
            range: preset.key,
            venueId,
            eventId,
          }),
          label: preset.label,
          active: result.ok && result.filters.range === preset.key,
        }))}
      />

      <form method="get" action="/dashboard" className="mt-4">
        <input type="hidden" name="range" value={rangeKey} />
        <FilterBar
          ariaLabel="Filter the absence overview"
          active={filtersActive}
          actions={
            <>
              <Button type="submit" size="sm">
                Apply
              </Button>
              {filtersActive ? (
                <ButtonLink href="/dashboard" variant="secondary" size="sm">
                  Reset
                </ButtonLink>
              ) : null}
            </>
          }
        >
          <FilterField label="From" htmlFor="dashboard-from">
            <input
              id="dashboard-from"
              name="from"
              type="date"
              defaultValue={result.filters.from}
              aria-invalid={datesInvalid || undefined}
              aria-describedby={datesInvalid ? "dashboard-range-error" : undefined}
              className={filterControlClassName()}
            />
          </FilterField>
          <FilterField label="To" htmlFor="dashboard-to">
            <input
              id="dashboard-to"
              name="to"
              type="date"
              defaultValue={result.filters.to}
              aria-invalid={datesInvalid || undefined}
              aria-describedby={datesInvalid ? "dashboard-range-error" : undefined}
              className={filterControlClassName()}
            />
          </FilterField>
          <FilterField label="Venue" htmlFor="dashboard-venue">
            <select
              id="dashboard-venue"
              name="venue"
              defaultValue={venueId}
              className={filterControlClassName()}
            >
              <option value="">All venues</option>
              {venues.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Event" htmlFor="dashboard-event">
            <select
              id="dashboard-event"
              name="event"
              defaultValue={eventId}
              className={filterControlClassName()}
            >
              <option value="">All events</option>
              {events.map((item) => (
                <option key={item.id} value={item.id}>
                  {eventOptionLabel(item)}
                </option>
              ))}
            </select>
          </FilterField>
        </FilterBar>
      </form>

      {result.ok ? (
        <div className="mt-4 rounded-xl border border-border bg-surface px-4 py-3">
          <p className="text-sm text-slate-800">
            <span className="font-medium">
              {formatDashboardSpan(result.range.fromIso, result.range.toIso)}
            </span>
            <span className="text-slate-600">
              {", "}compared with{" "}
              {formatDashboardSpan(
                result.range.previousFromIso,
                result.range.previousToIso,
              )}
              .
            </span>
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {venue?.name ?? "All venues"}. {eventLabel}. Archived records are
            excluded.
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Cancellation and AWOL are counted on the event date. Sickness is
            counted once, on the first working day sick, however many days the
            episode covers.
          </p>
          {venueId || eventId ? (
            <p className="mt-2 text-sm text-slate-800">
              Sickness is not recorded against a venue or event, so the
              sickness count ignores the venue and event filters.
            </p>
          ) : null}
          {eventId ? (
            <p className="mt-2 text-sm text-slate-600">
              {`Opening cancellation or AWOL in the ledger keeps these dates${
                venueId ? " and venue" : ""
              }. The ledger does not filter to one event.`}
            </p>
          ) : null}
        </div>
      ) : (
        <p
          id="dashboard-range-error"
          className="mt-3 text-sm text-red-700"
          role="alert"
        >
          {result.error}
        </p>
      )}
    </div>
  );
}

function eventOptionLabel(event: DashboardEventOption): string {
  const date = parseLocalDate(event.eventDateIso);
  const when = date ? formatLocalDateDisplay(date) : event.eventDateIso;
  const reference = event.reference ? ` (${event.reference})` : "";
  return `${event.name}${reference} · ${when}`;
}
