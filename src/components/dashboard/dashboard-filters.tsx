"use client";

import { useState } from "react";
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
import {
  formatPayPeriodName,
  payPeriodStatusSuffix,
  type PayPeriodLifecycle,
} from "@/lib/absence/pay-period";
import { formatLocalDateDisplay, parseLocalDate } from "@/lib/events/dates";

export function DashboardFilters({
  result,
  venueId,
  eventId,
  venues,
  events,
  periods,
  selectedPeriodId,
}: {
  result: DashboardQueryResult;
  venueId: string;
  eventId: string;
  venues: { id: string; name: string }[];
  events: DashboardEventOption[];
  periods: {
    id: string;
    number: number;
    label: string;
    startsOn?: string;
    status?: PayPeriodLifecycle;
  }[];
  selectedPeriodId: string;
}) {
  const [periodId, setPeriodId] = useState(selectedPeriodId);
  const rangeKey = result.ok ? result.filters.range : "custom";
  const datesInvalid = !result.ok;
  const periodLocked = periodId !== "";
  const venue = venues.find((item) => item.id === venueId);
  const event = events.find((item) => item.id === eventId);
  const selectedPeriod = periods.find((period) => period.id === selectedPeriodId);
  const filtersActive =
    Boolean(venueId || eventId || selectedPeriod) ||
    rangeKey !== "last30" ||
    datesInvalid;
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
          disabled: periodLocked,
          disabledNote: null,
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
          <FilterField label="Pay period" htmlFor="dashboard-period" className="min-w-[16rem]">
            <select
              id="dashboard-period"
              name="period"
              value={periodId}
              onChange={(event) => setPeriodId(event.target.value)}
              className={filterControlClassName()}
            >
              <option value="">Use the date range</option>
              {periods.map((period) => (
                <option key={period.id} value={period.id}>
                  {formatPayPeriodName(period)}
                  {period.status
                    ? payPeriodStatusSuffix(
                        { ...period, status: period.status },
                        periods,
                      )
                    : ""}
                </option>
              ))}
            </select>
            {periodLocked ? (
              <p id="dashboard-period-rule" className="mt-1 text-xs leading-5 text-muted">
                The date range is not applied. Counts are the absences filed in
                this pay period.
              </p>
            ) : null}
          </FilterField>
          <FilterField label="From" htmlFor="dashboard-from">
            <input
              id="dashboard-from"
              name="from"
              type="date"
              defaultValue={result.filters.from}
              disabled={periodLocked}
              aria-invalid={!periodLocked && datesInvalid ? true : undefined}
              aria-describedby={dateDescribedBy(periodLocked, datesInvalid)}
              className={filterControlClassName(
                "disabled:cursor-not-allowed disabled:bg-wash disabled:text-muted",
              )}
            />
          </FilterField>
          <FilterField label="To" htmlFor="dashboard-to">
            <input
              id="dashboard-to"
              name="to"
              type="date"
              defaultValue={result.filters.to}
              disabled={periodLocked}
              aria-invalid={!periodLocked && datesInvalid ? true : undefined}
              aria-describedby={dateDescribedBy(periodLocked, datesInvalid)}
              className={filterControlClassName(
                "disabled:cursor-not-allowed disabled:bg-wash disabled:text-muted",
              )}
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

      {selectedPeriod ? (
        <div className="mt-4 max-w-3xl space-y-1 text-sm leading-6 text-muted">
          <p>
            <span className="font-medium text-foreground">
              Pay period {formatPayPeriodName(selectedPeriod)}
            </span>
            . The date range is not applied. Counts are the absences filed in
            this pay period.
          </p>
          <p>
            {venue?.name ?? "All venues"}. {eventLabel}. Archived records are
            excluded.
          </p>
        </div>
      ) : result.ok ? (
        <div className="mt-4 max-w-3xl space-y-1 text-sm leading-6 text-muted">
          <p>
            <span className="font-medium text-foreground">
              {formatDashboardSpan(result.range.fromIso, result.range.toIso)}
            </span>
            , compared with{" "}
            {formatDashboardSpan(
              result.range.previousFromIso,
              result.range.previousToIso,
            )}
            .
          </p>
          <p>
            {venue?.name ?? "All venues"}. {eventLabel}. Archived records are
            excluded.
          </p>
          <p>
            Cancellation and AWOL are counted on the event date. Sickness is
            counted once, on the first working day sick, however many days the
            episode covers.
          </p>
          {venueId || eventId ? (
            <p className="text-foreground">
              Sickness is not recorded against a venue or event, so the
              sickness count ignores the venue and event filters.
            </p>
          ) : null}
          {eventId ? (
            <p>
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

function dateDescribedBy(periodLocked: boolean, datesInvalid: boolean) {
  const ids = [
    periodLocked ? "dashboard-period-rule" : null,
    !periodLocked && datesInvalid ? "dashboard-range-error" : null,
  ].filter((id) => id !== null);
  return ids.length > 0 ? ids.join(" ") : undefined;
}

function eventOptionLabel(event: DashboardEventOption): string {
  const date = parseLocalDate(event.eventDateIso);
  const when = date ? formatLocalDateDisplay(date) : event.eventDateIso;
  const reference = event.reference ? ` (${event.reference})` : "";
  return `${event.name}${reference} · ${when}`;
}
