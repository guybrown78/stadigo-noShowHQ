import { AbsenceContext } from "@/components/dashboard/absence-context";
import { AbsenceTotals } from "@/components/dashboard/absence-totals";
import { AbsenceTrend } from "@/components/dashboard/absence-trend";
import { AttendanceWatchlist } from "@/components/dashboard/attendance-watchlist";
import { DashboardFilters } from "@/components/dashboard/dashboard-filters";
import { RepeatAbsences } from "@/components/dashboard/repeat-absences";
import { WorkforceStatus } from "@/components/dashboard/workforce-status";
import { FollowUpDueSummary } from "@/components/absence/follow-up-due-summary";
import { PageHeader } from "@/components/ui/page-header";
import { countFollowUpsByDueState } from "@/lib/absence/follow-up-service";
import {
  getAbsenceDashboard,
  getPayPeriodDashboard,
  listDashboardEventOptions,
} from "@/lib/absence/dashboard-query";
import {
  buildDashboardBuckets,
  formatDashboardSpan,
  resolveDashboardQuery,
} from "@/lib/absence/dashboard-range";
import { formatPayPeriodName } from "@/lib/absence/pay-period";
import { listPayPeriods } from "@/lib/absence/pay-periods";
import { listLedgerFilterOptions, getTenantTimezone } from "@/lib/absence/queries";
import { todayIsoInTimeZone } from "@/lib/absence/timezone";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import {
  awolWatchlist,
  cancellationWatchlists,
  countWorkforceStatuses,
} from "@/lib/absence/watchlists";
import { formatLocalDateDisplay, parseLocalDate } from "@/lib/events/dates";

export const metadata = { title: "Dashboard" };

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireTenant();
  const raw = await searchParams;

  let timeZone: string | null = null;
  try {
    timeZone = await getTenantTimezone(prisma, user.tenantId);
  } catch {
    timeZone = null;
  }

  if (!timeZone) {
    return (
      <div>
        <PageHeader
          title="Dashboard"
          description="Cancellation, AWOL and sickness for the period you choose, and the staff who were absent more than once."
        />
        <p className="mt-6 text-sm text-slate-600">
          Absence totals need a valid organisation timezone before they can be
          shown.
        </p>
      </div>
    );
  }

  const todayIso = todayIsoInTimeZone(timeZone);
  const resolved = resolveDashboardQuery(
    {
      range: first(raw.range),
      from: first(raw.from),
      to: first(raw.to),
      venue: first(raw.venue),
      event: first(raw.event),
    },
    todayIso,
  );

  const [venues, periods] = await Promise.all([
    listLedgerFilterOptions(prisma, user.tenantId).then((options) => options.venues),
    listPayPeriods(prisma, user.tenantId),
  ]);
  const selectedPeriod =
    periods.find((period) => period.id === first(raw.period)) ?? null;
  const previousNumberedPeriod = selectedPeriod
    ? (periods
        .filter(
          (period) =>
            period.status === "CLOSED" && period.number < selectedPeriod.number,
        )
        .sort((left, right) => right.number - left.number)[0] ?? null)
    : null;
  const venueId = venues.some((venue) => venue.id === resolved.filters.venueId)
    ? resolved.filters.venueId
    : "";
  const eventWindow = selectedPeriod
    ? {
        from: parseLocalDate(selectedPeriod.startsOn),
        to: parseLocalDate(selectedPeriod.endsOn),
      }
    : resolved.ok
      ? { from: resolved.range.from, to: resolved.range.to }
      : null;
  const events = eventWindow?.from && eventWindow.to
    ? await listDashboardEventOptions(
        prisma,
        user.tenantId,
        eventWindow.from,
        eventWindow.to,
        resolved.filters.eventId,
      )
    : [];
  const eventId = events.some((event) => event.id === resolved.filters.eventId)
    ? resolved.filters.eventId
    : "";

  const periodBuckets = selectedPeriod
    ? buildDashboardBuckets(selectedPeriod.startsOn, selectedPeriod.endsOn)
    : null;
  const overview = selectedPeriod
    ? await getPayPeriodDashboard(prisma, user.tenantId, {
        periodId: selectedPeriod.id,
        previousPeriodId: previousNumberedPeriod?.id ?? null,
        buckets: periodBuckets?.buckets ?? [],
        venueId: venueId || null,
        eventId: eventId || null,
      })
    : resolved.ok
      ? await getAbsenceDashboard(prisma, user.tenantId, {
          from: resolved.range.from,
          to: resolved.range.to,
          previousFrom: resolved.range.previousFrom,
          previousTo: resolved.range.previousTo,
          buckets: resolved.buckets,
          venueId: venueId || null,
          eventId: eventId || null,
        })
      : null;

  const attendance = await prisma.tenant.findUniqueOrThrow({
    where: { id: user.tenantId },
    select: {
      cancellationThreshold: true,
      awolThresholdCount: true,
      awolWindowDays: true,
    },
  });
  const [workforce, cancellations, awol] = await Promise.all([
    countWorkforceStatuses(prisma, user.tenantId),
    cancellationWatchlists(prisma, user.tenantId, attendance),
    awolWatchlist(prisma, user.tenantId, todayIso, attendance),
  ]);

  let followUps: { overdue: number; dueToday: number; upcoming: number } | null =
    null;
  try {
    const today = parseLocalDate(todayIso);
    if (today) {
      followUps = await countFollowUpsByDueState(prisma, user.tenantId, today);
    }
  } catch {
    followUps = null;
  }

  const overviewBounds = selectedPeriod
    ? {
        fromIso: selectedPeriod.startsOn,
        toIso: selectedPeriod.endsOn,
        previousFromIso: previousNumberedPeriod?.startsOn ?? selectedPeriod.startsOn,
        previousToIso: previousNumberedPeriod?.endsOn ?? selectedPeriod.endsOn,
        grain: periodBuckets?.grain ?? "day",
        label: formatPayPeriodName(selectedPeriod),
      }
    : resolved.ok
      ? {
          fromIso: resolved.range.fromIso,
          toIso: resolved.range.toIso,
          previousFromIso: resolved.range.previousFromIso,
          previousToIso: resolved.range.previousToIso,
          grain: resolved.range.grain,
          label: formatDashboardSpan(resolved.range.fromIso, resolved.range.toIso),
        }
      : null;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Cancellation, AWOL and sickness for the period you choose, and the staff who were absent more than once."
      />
      <DashboardFilters
        result={resolved}
        venueId={venueId}
        eventId={eventId}
        venues={venues}
        events={events}
        periods={periods}
        selectedPeriodId={selectedPeriod?.id ?? ""}
      />
      {overview && overviewBounds ? (
        <>
          <AbsenceTotals
            current={overview.current}
            previous={overview.previous}
            fromIso={overviewBounds.fromIso}
            toIso={overviewBounds.toIso}
            previousFromIso={overviewBounds.previousFromIso}
            previousToIso={overviewBounds.previousToIso}
            venueId={venueId}
            eventFiltered={Boolean(eventId)}
            periodId={selectedPeriod?.id}
            comparisonLabel={
              selectedPeriod
                ? previousNumberedPeriod
                  ? formatPayPeriodName(previousNumberedPeriod)
                  : "No previous pay period"
                : undefined
            }
          />
          {followUps ? <FollowUpDueSummary counts={followUps} /> : null}
          <RepeatAbsences
            rows={overview.repeats}
            filtersActive={Boolean(venueId || eventId)}
          />
          <AbsenceTrend
            buckets={overview.trend}
            grain={overviewBounds.grain}
            periodLabel={overviewBounds.label}
            sicknessUnfiltered={Boolean(venueId || eventId)}
          />
          <AbsenceContext
            venues={overview.venues}
            events={overview.events}
            showVenues={!eventId}
            fromIso={overviewBounds.fromIso}
            toIso={overviewBounds.toIso}
          />
        </>
      ) : followUps ? (
        <FollowUpDueSummary counts={followUps} />
      ) : null}
      <WorkforceStatus counts={workforce} />
      <AttendanceWatchlist
        title="Cancellations this pay period"
        description={
          cancellations.openPeriod
            ? `${attendance.cancellationThreshold} or more cancellations filed in period ${cancellations.openPeriod.number}, ${cancellations.openPeriod.label}.`
            : "Open a pay period in Settings to count cancellations for the current period."
        }
        rows={cancellations.current}
        empty={
          cancellations.openPeriod
            ? "Nobody has reached the cancellation threshold this pay period."
            : "No pay period is open."
        }
        periodId={cancellations.openPeriod?.id}
        type="cancellations"
      />
      <AttendanceWatchlist
        title="Repeated cancellations"
        description={
          cancellations.previousPeriod
            ? `Also reached ${attendance.cancellationThreshold} or more in period ${cancellations.previousPeriod.number}, ${cancellations.previousPeriod.label}.`
            : "There is no previous pay period yet."
        }
        rows={cancellations.repeated}
        empty={
          cancellations.previousPeriod
            ? "Nobody reached the threshold in both this pay period and the previous one."
            : "A previous pay period is needed before this can be shown."
        }
        periodId={cancellations.previousPeriod?.id}
        type="cancellations"
      />
      <AttendanceWatchlist
        title="AWOL threshold"
        description={`${attendance.awolThresholdCount} or more AWOLs from ${periodLabel(awol.fromIso, awol.toIso)}. Cancelling or postponing the event does not remove these records.`}
        rows={awol.rows}
        empty="Nobody has reached the AWOL threshold in this window."
        fromIso={awol.fromIso}
        toIso={awol.toIso}
        type="awol"
        dateField="affected"
      />
    </div>
  );
}

function periodLabel(fromIso: string, toIso: string): string {
  const from = parseLocalDate(fromIso);
  const to = parseLocalDate(toIso);
  if (!from || !to) {
    return `${fromIso} to ${toIso}`;
  }
  return `${formatLocalDateDisplay(from)} to ${formatLocalDateDisplay(to)}`;
}
