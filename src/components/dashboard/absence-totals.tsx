import { Tally, TallyCell } from "@/components/ui/tally";
import { formatDashboardSpanCompact } from "@/lib/absence/dashboard-range";
import type { DashboardTypeCounts } from "@/lib/absence/dashboard-query";
import { ledgerListHref } from "@/lib/absence/url";

const TYPES = [
  {
    key: "CANCELLATION" as const,
    label: "Cancellation",
    view: "cancellations" as const,
    bar: "bg-cancel",
    filtered: true,
    unauthorised: false,
  },
  {
    key: "UNAUTHORISED" as const,
    label: "Unauthorised",
    view: "cancellations" as const,
    bar: "bg-slate-800",
    filtered: true,
    unauthorised: true,
  },
  {
    key: "AWOL" as const,
    label: "AWOL",
    view: "awol" as const,
    bar: "bg-awol",
    filtered: true,
    unauthorised: false,
  },
  {
    key: "SICKNESS" as const,
    label: "Sickness",
    view: "sickness" as const,
    bar: "bg-sickness",
    filtered: false,
    unauthorised: false,
  },
];

export function AbsenceTotals({
  current,
  previous,
  fromIso,
  toIso,
  previousFromIso,
  previousToIso,
  venueId,
  eventFiltered,
  periodId,
  comparisonLabel,
}: {
  current: DashboardTypeCounts;
  previous: DashboardTypeCounts;
  fromIso: string;
  toIso: string;
  previousFromIso: string;
  previousToIso: string;
  venueId: string;
  eventFiltered: boolean;
  periodId?: string;
  comparisonLabel?: string;
}) {
  const previousLabel =
    comparisonLabel ?? formatDashboardSpanCompact(previousFromIso, previousToIso);
  const ledgerDates = periodId
    ? { period: periodId }
    : { affectedFrom: fromIso, affectedTo: toIso };
  const selectionActive = Boolean(venueId) || eventFiltered;
  const totalCurrent =
    current.CANCELLATION + current.AWOL + current.SICKNESS;
  const totalPrevious =
    previous.CANCELLATION + previous.AWOL + previous.SICKNESS;

  return (
    <section className="mt-8" aria-labelledby="absence-totals-heading">
      <h2 id="absence-totals-heading" className="sr-only">
        Absence totals
      </h2>
      <Tally columns={5}>
        {TYPES.map((type) => (
          <TallyCell
            key={type.key}
            href={ledgerListHref({
              view: type.view,
              ...ledgerDates,
              venue: type.filtered ? venueId : "",
              unauthorised: type.unauthorised,
            })}
            label={type.label}
            value={current[type.key]}
            swatch={type.bar}
            accent={type.bar}
            action="View in ledger"
            actionVisible
          >
            <ComparedWith value={previous[type.key]} label={previousLabel} />
            {type.key === "UNAUTHORISED" ? (
              <span className="mt-2 block text-xs leading-5">
                Cancellations marked unauthorised.
              </span>
            ) : null}
            {type.key === "SICKNESS" && selectionActive ? (
              <span className="mt-2 block text-xs leading-5">
                Sickness is not recorded against a venue or event, so this
                count ignores those filters.
              </span>
            ) : null}
            {type.filtered && eventFiltered ? (
              <span className="mt-2 block text-xs leading-5">
                The ledger keeps these dates and is not limited to this event.
              </span>
            ) : null}
          </TallyCell>
        ))}
        <TallyCell
          href={
            selectionActive
              ? undefined
              : ledgerListHref({
                  view: "all",
                  ...ledgerDates,
                })
          }
          label="Total"
          value={totalCurrent}
          accent="bg-muted"
          action={selectionActive ? undefined : "View in ledger"}
          actionVisible={!selectionActive}
        >
          <ComparedWith value={totalPrevious} label={previousLabel} />
          {selectionActive ? (
            <span className="mt-2 block text-xs leading-5">
              Cancellation and AWOL for this selection, plus sickness for these
              dates.
            </span>
          ) : null}
        </TallyCell>
      </Tally>
    </section>
  );
}

function ComparedWith({ value, label }: { value: number; label: string }) {
  return (
    <>
      <span>
        Compared with{" "}
        <span className="font-medium text-foreground tabular-nums">{value}</span>
      </span>
      <span className="mt-0.5 block">{label}</span>
    </>
  );
}
