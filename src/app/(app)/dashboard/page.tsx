import { AbsenceContext } from "@/components/dashboard/absence-context";
import { AbsenceTotals } from "@/components/dashboard/absence-totals";
import { AbsenceTrend } from "@/components/dashboard/absence-trend";
import { DashboardFilters } from "@/components/dashboard/dashboard-filters";
import { RepeatAbsences } from "@/components/dashboard/repeat-absences";
import { FollowUpDueSummary } from "@/components/absence/follow-up-due-summary";
import { PageHeader } from "@/components/ui/page-header";
import { countFollowUpsByDueState } from "@/lib/absence/follow-up-service";
import {
  getAbsenceDashboard,
  listDashboardEventOptions,
} from "@/lib/absence/dashboard-query";
import {
  formatDashboardSpan,
  resolveDashboardQuery,
} from "@/lib/absence/dashboard-range";
import { listLedgerFilterOptions, getTenantTimezone } from "@/lib/absence/queries";
import { todayIsoInTimeZone } from "@/lib/absence/timezone";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { parseLocalDate } from "@/lib/events/dates";

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

  const venues = (await listLedgerFilterOptions(prisma, user.tenantId)).venues;
  const venueId = venues.some((venue) => venue.id === resolved.filters.venueId)
    ? resolved.filters.venueId
    : "";
  const events = resolved.ok
    ? await listDashboardEventOptions(
        prisma,
        user.tenantId,
        resolved.range.from,
        resolved.range.to,
        resolved.filters.eventId,
      )
    : [];
  const eventId = events.some((event) => event.id === resolved.filters.eventId)
    ? resolved.filters.eventId
    : "";

  const overview = resolved.ok
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
      />
      {resolved.ok && overview ? (
        <>
          <AbsenceTotals
            current={overview.current}
            previous={overview.previous}
            fromIso={resolved.range.fromIso}
            toIso={resolved.range.toIso}
            previousFromIso={resolved.range.previousFromIso}
            previousToIso={resolved.range.previousToIso}
            venueId={venueId}
            eventFiltered={Boolean(eventId)}
          />
          {followUps ? <FollowUpDueSummary counts={followUps} /> : null}
          <RepeatAbsences
            rows={overview.repeats}
            filtersActive={Boolean(venueId || eventId)}
          />
          <AbsenceTrend
            buckets={overview.trend}
            grain={resolved.range.grain}
            periodLabel={formatDashboardSpan(
              resolved.range.fromIso,
              resolved.range.toIso,
            )}
            sicknessUnfiltered={Boolean(venueId || eventId)}
          />
          <AbsenceContext
            venues={overview.venues}
            events={overview.events}
            showVenues={!eventId}
            fromIso={resolved.range.fromIso}
            toIso={resolved.range.toIso}
          />
        </>
      ) : followUps ? (
        <FollowUpDueSummary counts={followUps} />
      ) : null}
    </div>
  );
}
