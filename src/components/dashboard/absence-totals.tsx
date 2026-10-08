import Link from "next/link";
import { ledgerListHref } from "@/lib/absence/url";
import { formatDashboardSpanCompact } from "@/lib/absence/dashboard-range";
import type { DashboardTypeCounts } from "@/lib/absence/dashboard-query";

const TYPES = [
  {
    key: "CANCELLATION" as const,
    label: "Cancellation",
    view: "cancellations" as const,
    bar: "bg-cancel",
    filtered: true,
  },
  {
    key: "AWOL" as const,
    label: "AWOL",
    view: "awol" as const,
    bar: "bg-awol",
    filtered: true,
  },
  {
    key: "SICKNESS" as const,
    label: "Sickness",
    view: "sickness" as const,
    bar: "bg-sickness",
    filtered: false,
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
}: {
  current: DashboardTypeCounts;
  previous: DashboardTypeCounts;
  fromIso: string;
  toIso: string;
  previousFromIso: string;
  previousToIso: string;
  venueId: string;
  eventFiltered: boolean;
}) {
  const previousLabel = formatDashboardSpanCompact(previousFromIso, previousToIso);
  const selectionActive = Boolean(venueId) || eventFiltered;
  const totalCurrent =
    current.CANCELLATION + current.AWOL + current.SICKNESS;
  const totalPrevious =
    previous.CANCELLATION + previous.AWOL + previous.SICKNESS;

  return (
    <section className="mt-6" aria-labelledby="absence-totals-heading">
      <h2 id="absence-totals-heading" className="sr-only">
        Absence totals
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {TYPES.map((type) => (
          <li key={type.key}>
            <Link
              href={ledgerListHref({
                view: type.view,
                affectedFrom: fromIso,
                affectedTo: toIso,
                venue: type.filtered ? venueId : "",
              })}
              className="group block h-full"
            >
              <article className="h-full overflow-hidden rounded-xl border border-border bg-surface shadow-sm transition-colors group-hover:border-slate-300">
                <div className={`h-1 ${type.bar}`} />
                <div className="p-4">
                  <p className="text-sm font-medium text-slate-600">
                    {type.label}
                  </p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">
                    {current[type.key]}
                  </p>
                  <p className="mt-3 text-sm leading-5 text-slate-600">
                    Compared with{" "}
                    <span className="font-medium text-slate-800 tabular-nums">
                      {previous[type.key]}
                    </span>
                    <span className="mt-0.5 block text-slate-500">{previousLabel}</span>
                  </p>
                  {type.key === "SICKNESS" && selectionActive ? (
                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      Sickness is not recorded against a venue or event, so
                      this count ignores those filters.
                    </p>
                  ) : null}
                  {type.filtered && eventFiltered ? (
                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      The ledger keeps these dates and is not limited to this
                      event.
                    </p>
                  ) : null}
                  <p className="mt-3 text-sm font-medium text-primary-hover group-hover:underline">
                    View in ledger
                  </p>
                </div>
              </article>
            </Link>
          </li>
        ))}
        <li>
          <TotalCard
            href={
              selectionActive
                ? undefined
                : ledgerListHref({
                    view: "all",
                    affectedFrom: fromIso,
                    affectedTo: toIso,
                  })
            }
            total={totalCurrent}
            previous={totalPrevious}
            previousLabel={previousLabel}
            selectionActive={selectionActive}
          />
        </li>
      </ul>
    </section>
  );
}

function TotalCard({
  href,
  total,
  previous,
  previousLabel,
  selectionActive,
}: {
  href?: string;
  total: number;
  previous: number;
  previousLabel: string;
  selectionActive: boolean;
}) {
  const body = (
    <article className="h-full overflow-hidden rounded-xl border border-border bg-surface shadow-sm transition-colors group-hover:border-slate-300">
      <div className="h-1 bg-slate-300" />
      <div className="p-4">
        <p className="text-sm font-medium text-slate-600">Total</p>
        <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">
          {total}
        </p>
        <p className="mt-3 text-sm leading-5 text-slate-600">
          Compared with{" "}
          <span className="font-medium text-slate-800 tabular-nums">{previous}</span>
          <span className="mt-0.5 block text-slate-500">{previousLabel}</span>
        </p>
        {selectionActive ? (
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Cancellation and AWOL for this selection, plus sickness for these
            dates.
          </p>
        ) : (
          <p className="mt-3 text-sm font-medium text-primary-hover group-hover:underline">
            View in ledger
          </p>
        )}
      </div>
    </article>
  );
  if (!href) {
    return body;
  }
  return (
    <Link href={href} className="group block h-full">
      {body}
    </Link>
  );
}
