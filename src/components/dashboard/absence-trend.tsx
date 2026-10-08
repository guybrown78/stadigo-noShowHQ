import { Card, CardBody, CardHeader } from "@/components/ui/card";
import type { DashboardGrain } from "@/lib/absence/dashboard-range";
import type { DashboardTrendBucket } from "@/lib/absence/dashboard-query";

const GRAIN_COPY: Record<DashboardGrain, string> = {
  day: "Each bar is one day.",
  week: "Each bar is one week.",
  month: "Each bar is one month.",
};

const SERIES = [
  { key: "CANCELLATION" as const, label: "Cancellation", fill: "var(--cancel)", swatch: "bg-cancel" },
  { key: "AWOL" as const, label: "AWOL", fill: "var(--awol)", swatch: "bg-awol" },
  { key: "SICKNESS" as const, label: "Sickness", fill: "var(--sickness)", swatch: "bg-sickness" },
];

export function AbsenceTrend({
  buckets,
  grain,
  periodLabel,
  sicknessUnfiltered,
}: {
  buckets: DashboardTrendBucket[];
  grain: DashboardGrain;
  periodLabel: string;
  sicknessUnfiltered: boolean;
}) {
  const hasAbsences = buckets.some(
    (bucket) => bucket.CANCELLATION + bucket.AWOL + bucket.SICKNESS > 0,
  );
  const description = sicknessUnfiltered
    ? `${GRAIN_COPY[grain]} Sickness is not recorded against a venue or event, so those bars ignore the venue and event filters.`
    : GRAIN_COPY[grain];

  return (
    <section className="mt-8" aria-labelledby="absence-trend-heading">
      <Card>
        <CardHeader
          headingId="absence-trend-heading"
          title="Across the period"
          description={description}
        />
        <CardBody>
          {hasAbsences ? (
            <TrendChart buckets={buckets} grain={grain} periodLabel={periodLabel} />
          ) : (
            <p className="text-sm text-slate-600">No absences in this period.</p>
          )}
        </CardBody>
      </Card>
    </section>
  );
}

function TrendChart({
  buckets,
  grain,
  periodLabel,
}: {
  buckets: DashboardTrendBucket[];
  grain: DashboardGrain;
  periodLabel: string;
}) {
  const slot = grain === "day" ? 48 : 84;
  const height = 208;
  const padLeft = 36;
  const padRight = 12;
  const padTop = 16;
  const padBottom = 40;
  const plotHeight = height - padTop - padBottom;
  const width = padLeft + padRight + buckets.length * slot;
  const max = Math.max(
    1,
    ...buckets.map(
      (bucket) => bucket.CANCELLATION + bucket.AWOL + bucket.SICKNESS,
    ),
  );
  const ticks = max <= 2 ? [0, max] : [0, Math.round(max / 2), max];
  const uniqueTicks = [...new Set(ticks)];

  function y(value: number) {
    return padTop + plotHeight - (value / max) * plotHeight;
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`Absences across ${periodLabel} by cancellation, AWOL and sickness`}
          className="max-w-none"
        >
          {uniqueTicks.map((tick) => (
            <g key={tick}>
              <line
                x1={padLeft}
                x2={width - padRight}
                y1={y(tick)}
                y2={y(tick)}
                stroke="#e2e8f0"
              />
              <text
                x={padLeft - 8}
                y={y(tick) + 4}
                textAnchor="end"
                fill="#64748b"
                fontSize="11"
              >
                {tick}
              </text>
            </g>
          ))}
          {buckets.map((bucket, index) => {
            const x = padLeft + index * slot + slot * 0.2;
            const barWidth = slot * 0.6;
            let accumulated = 0;
            return (
              <g key={`${bucket.fromIso}-${bucket.toIso}`}>
                <title>
                  {`${bucket.label}: ${bucket.CANCELLATION} cancellation, ${bucket.AWOL} AWOL, ${bucket.SICKNESS} sickness`}
                </title>
                {SERIES.map((series) => {
                  const count = bucket[series.key];
                  if (count === 0) return null;
                  const next = accumulated + count;
                  const top = y(next);
                  const barHeight = y(accumulated) - top;
                  accumulated = next;
                  return (
                    <rect
                      key={series.key}
                      x={x}
                      y={top}
                      width={barWidth}
                      height={Math.max(barHeight, 0)}
                      fill={series.fill}
                    />
                  );
                })}
                <text
                  x={x + barWidth / 2}
                  y={height - 14}
                  textAnchor="middle"
                  fill="#64748b"
                  fontSize="11"
                >
                  {bucket.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-600">
        {SERIES.map((series) => (
          <li key={series.key} className="inline-flex items-center gap-2">
            <span className={`size-2.5 rounded-sm ${series.swatch}`} aria-hidden="true" />
            {series.label}
          </li>
        ))}
      </ul>
      <table className="sr-only">
        <caption>Absences across {periodLabel}</caption>
        <thead>
          <tr>
            <th>Period</th>
            <th>Cancellation</th>
            <th>AWOL</th>
            <th>Sickness</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((bucket) => (
            <tr key={`${bucket.fromIso}-table`}>
              <th scope="row">{bucket.label}</th>
              <td>{bucket.CANCELLATION}</td>
              <td>{bucket.AWOL}</td>
              <td>{bucket.SICKNESS}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
