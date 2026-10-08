import { Children } from "react";
import Link from "next/link";
import { CountBar } from "@/components/dashboard/count-bar";
import { Card, CardHeader } from "@/components/ui/card";
import type {
  DashboardEventRow,
  DashboardVenueRow,
} from "@/lib/absence/dashboard-query";
import { ledgerListHref } from "@/lib/absence/url";
import { formatLocalDateDisplay, parseLocalDate } from "@/lib/events/dates";

export function AbsenceContext({
  venues,
  events,
  showVenues,
  fromIso,
  toIso,
}: {
  venues: DashboardVenueRow[];
  events: DashboardEventRow[];
  showVenues: boolean;
  fromIso: string;
  toIso: string;
}) {
  return (
    <div
      className={`mt-4 grid gap-4 ${showVenues ? "lg:grid-cols-2" : ""}`}
    >
      {showVenues ? (
        <ContextCard
          title="By venue"
          description="Cancellation and AWOL. Sickness is not recorded against a venue."
          empty="No cancellation or AWOL records in this period."
        >
          {venues.map((venue) => (
            <ContextRow
              key={venue.venueId ?? "none"}
              href={
                venue.venueId
                  ? ledgerListHref({
                      view: "all",
                      affectedFrom: fromIso,
                      affectedTo: toIso,
                      venue: venue.venueId,
                    })
                  : undefined
              }
              title={venue.name}
              meta={breakdown(venue.cancellation, venue.awol)}
              total={venue.total}
              cancellation={venue.cancellation}
              awol={venue.awol}
            />
          ))}
        </ContextCard>
      ) : null}
      <ContextCard
        title="By event"
        description="Events with a cancellation or AWOL in this period. Sickness is not linked to an event."
        empty="No events have a cancellation or AWOL in this period."
      >
        {events.map((event) => {
          const date = parseLocalDate(event.eventDateIso);
          return (
            <ContextRow
              key={event.eventId}
              href={`/events/${event.eventId}`}
              title={event.name}
              meta={
                date
                  ? `${formatLocalDateDisplay(date)} · ${breakdown(event.cancellation, event.awol)}`
                  : breakdown(event.cancellation, event.awol)
              }
              total={event.total}
              cancellation={event.cancellation}
              awol={event.awol}
            />
          );
        })}
      </ContextCard>
    </div>
  );
}

function ContextCard({
  title,
  description,
  empty,
  children,
}: {
  title: string;
  description: string;
  empty: string;
  children: React.ReactNode;
}) {
  const rows = Children.toArray(children);
  return (
    <Card className="overflow-hidden">
      <CardHeader title={title} description={description} />
      {rows.length > 0 ? (
        <ul>{rows}</ul>
      ) : (
        <p className="px-5 py-4 text-sm text-slate-600">{empty}</p>
      )}
    </Card>
  );
}

function ContextRow({
  href,
  title,
  meta,
  total,
  cancellation,
  awol,
}: {
  href?: string;
  title: string;
  meta: string;
  total: number;
  cancellation: number;
  awol: number;
}) {
  const heading = href ? (
    <Link href={href} className="font-medium text-slate-900 hover:underline">
      {title}
    </Link>
  ) : (
    <p className="font-medium text-slate-900">{title}</p>
  );
  return (
    <li className="border-t border-border px-5 py-3 first:border-t-0">
      <div className="flex items-baseline justify-between gap-3">
        {heading}
        <span className="text-sm font-semibold text-slate-900 tabular-nums">
          {total}
        </span>
      </div>
      <p className="mt-0.5 text-sm text-slate-500">{meta}</p>
      <CountBar
        className="mt-2 max-w-xs"
        cancellation={cancellation}
        awol={awol}
        includeSickness={false}
      />
    </li>
  );
}

function breakdown(cancellation: number, awol: number): string {
  const cancellationLabel = cancellation === 1 ? "cancellation" : "cancellations";
  return `${cancellation} ${cancellationLabel}, ${awol} AWOL`;
}
