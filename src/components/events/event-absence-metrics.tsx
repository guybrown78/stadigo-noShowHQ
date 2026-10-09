import Link from "next/link";
import { AbsenceTypeBadge, NoticeWarningBadges } from "@/components/absence/absence-badges";
import { CountBar } from "@/components/dashboard/count-bar";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import type { EventAbsenceReportRow } from "@/lib/absence/queries";
import {
  formatCalendarNotice,
  formatDurationMinutes,
  formatNoticeSummary,
} from "@/lib/absence/display";
import {
  summariseEventAbsences,
  type CancellationWindowKey,
  type EventAbsenceSummary,
  type FillStatus,
  type NoticeHourKey,
} from "@/lib/events/absence-metrics";
import { formatStaffName } from "@/lib/staff/display";

const FILL_BAR: Record<FillStatus, string> = {
  healthy: "bg-primary",
  warning: "bg-amber-500",
  critical: "bg-cancel",
};

const FILL_TEXT: Record<FillStatus, string> = {
  healthy: "text-primary-hover",
  warning: "text-amber-700",
  critical: "text-cancel",
};

const FILL_STATUS_LABEL: Record<FillStatus, string> = {
  healthy: "At or above the warning threshold",
  warning: "Below the warning threshold",
  critical: "Below the critical threshold",
};

const WINDOW_ROWS: { key: CancellationWindowKey; label: string }[] = [
  { key: "retrospective", label: "Retrospective" },
  { key: "sameDay", label: "Same day" },
  { key: "oneToThree", label: "1–3 days" },
  { key: "fourToSeven", label: "4–7 days" },
  { key: "sevenPlus", label: "7+ days" },
];

const HOUR_ROWS: { key: NoticeHourKey; label: string }[] = [
  { key: "over24h", label: "More than 24 hours" },
  { key: "twelveTo24h", label: "12–24 hours" },
  { key: "under12h", label: "Under 12 hours" },
  { key: "retrospective", label: "Retrospective" },
];

export function EventAbsenceMetrics({
  staffRequired,
  warningFillRate,
  criticalFillRate,
  absences,
  archivedCount,
}: {
  staffRequired: number;
  warningFillRate: number;
  criticalFillRate: number;
  absences: EventAbsenceReportRow[];
  archivedCount: number;
}) {
  const summary = summariseEventAbsences({
    staffRequired,
    warningFillRate,
    criticalFillRate,
    absences: absences.map((absence) => ({
      type: absence.type,
      reason: absence.reason,
      notice: absence.notice
        ? {
            noticeCalendarDays: absence.notice.noticeCalendarDays,
            noticeMinutes: absence.notice.noticeMinutes,
            noticeBasis: absence.notice.noticeBasis,
          }
        : null,
    })),
  });

  return (
    <section className="mt-8" aria-labelledby="event-absence-report-heading">
      <h2
        id="event-absence-report-heading"
        className="text-lg font-semibold text-slate-900"
      >
        Absence report
      </h2>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">
        Estimated from cancellations and AWOLs logged against this event.
        Sickness is not recorded against an event, so it is not included.
      </p>
      {archivedCount > 0 ? (
        <p className="mt-2 text-sm text-slate-600">
          {archivedCount === 1
            ? "1 archived absence is excluded from this report."
            : `${archivedCount} archived absences are excluded from this report.`}
        </p>
      ) : null}

      <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard label="Staff required" value={String(summary.staffRequired)} />
        <MetricCard
          label="Estimated fill rate"
          value={`${summary.fillRate}%`}
          valueClassName={`text-3xl ${FILL_TEXT[summary.fillStatus]}`}
          detail={FILL_STATUS_LABEL[summary.fillStatus]}
          bar={FILL_BAR[summary.fillStatus]}
        />
        <MetricCard
          label="Absences logged"
          value={String(summary.absences)}
          detail="Cancellations and AWOLs"
        />
        <MetricCard
          label="Cancellations"
          value={String(summary.cancellations)}
          bar="bg-cancel"
        />
        <MetricCard label="AWOLs" value={String(summary.awols)} bar="bg-awol" />
        <MetricCard
          label="Average notice"
          value={averageNoticeValue(summary)}
          valueClassName="text-2xl"
          detail={averageNoticeDetail(summary)}
        />
      </ul>

      <Card className="mt-4">
        <CardHeader
          headingId="event-fill-rate-heading"
          title="Fill rate"
          description={`Warning at ${warningFillRate}% · Critical at ${criticalFillRate}%. Each logged absence counts as one person.`}
        />
        <CardBody>
          <FillRateBar summary={summary} />
          <p className="mt-3 text-sm text-slate-600">
            {summary.exceedsRequirement
              ? "Logged absences exceed the staff requirement, so the estimate is 0%."
              : `${summary.covered} of ${summary.staffRequired} required staff still covered.`}
          </p>
        </CardBody>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            headingId="event-absence-split-heading"
            title="By type"
            description="Active cancellations and AWOLs on this event."
          />
          <CardBody>
            {summary.absences === 0 ? (
              <p className="text-sm text-slate-600">No absences logged.</p>
            ) : (
              <>
                <CountBar
                  cancellation={summary.cancellations}
                  awol={summary.awols}
                  includeSickness={false}
                  className="h-3"
                />
                <ul className="mt-4 space-y-2 text-sm">
                  <TypeCount
                    label="Cancellation"
                    count={summary.cancellations}
                    swatch="bg-cancel"
                  />
                  <TypeCount
                    label="AWOL"
                    count={summary.awols}
                    swatch="bg-awol"
                  />
                </ul>
              </>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            headingId="event-cancellation-window-heading"
            title="Cancellation window"
            description="Calendar days between the reported date and the event date."
          />
          <CardBody>
            {summary.cancellations === 0 ? (
              <p className="text-sm text-slate-600">No cancellations logged.</p>
            ) : (
              <HorizontalBars
                barClassName="bg-cancel"
                rows={WINDOW_ROWS.map((row) => ({
                  label: row.label,
                  count: summary.window[row.key],
                }))}
              />
            )}
          </CardBody>
        </Card>

        <Card className={summary.reasons.length === 0 ? "lg:col-span-2" : undefined}>
          <CardHeader
            headingId="event-notice-hours-heading"
            title="Notice distribution"
            description="Exact-time cancellations only. Date-only records stay in the cancellation window."
          />
          <CardBody>
            {summary.exactTimeCancellations === 0 ? (
              <p className="text-sm text-slate-600">
                {summary.dateOnlyCancellations === 0
                  ? "No cancellations have an exact time."
                  : "No cancellations have an exact time, so there is no hour breakdown."}
              </p>
            ) : (
              <HorizontalBars
                barClassName="bg-primary"
                rows={HOUR_ROWS.map((row) => ({
                  label: row.label,
                  count: summary.noticeHours[row.key],
                }))}
              />
            )}
            {summary.dateOnlyCancellations > 0 ? (
              <p className="mt-3 text-sm text-slate-600">
                {summary.dateOnlyCancellations === 1
                  ? "1 cancellation was recorded by date only and is not in these hour buckets."
                  : `${summary.dateOnlyCancellations} cancellations were recorded by date only and are not in these hour buckets.`}
              </p>
            ) : null}
          </CardBody>
        </Card>

        {summary.reasons.length > 0 ? (
          <Card>
            <CardHeader
              headingId="event-absence-reasons-heading"
              title="Cancellation reasons"
              description="Counted from the reason recorded on each cancellation."
            />
            <CardBody>
              <ul className="space-y-2">
                {summary.reasons.map((reason) => (
                  <li
                    key={reason.reason}
                    className="flex items-baseline justify-between gap-3 text-sm"
                  >
                    <span className="text-slate-800">{reason.reason}</span>
                    <span className="tabular-nums font-medium text-slate-900">
                      {reason.count}
                    </span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        ) : null}
      </div>

      <Card className="mt-4">
        <CardHeader
          headingId="event-absence-people-heading"
          title="People"
          description="Active cancellations and AWOLs. Archived records are left out."
        />
        <CardBody>
          {absences.length === 0 ? (
            <p className="text-sm text-slate-600">
              No active cancellations or AWOLs are logged against this event.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {absences.map((absence) => (
                <li
                  key={absence.id}
                  className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div>
                    <p className="flex flex-wrap items-center gap-2">
                      <AbsenceTypeBadge type={absence.type} />
                      <Link
                        href={`/staff/${absence.staff.id}`}
                        className="font-medium text-slate-900 underline"
                      >
                        {formatStaffName(absence.staff)}
                      </Link>
                      <span className="text-sm text-slate-500">
                        {absence.staff.staffIdNumber}
                      </span>
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Notice{" "}
                      {absence.notice
                        ? formatNoticeSummary(absence.notice)
                        : "—"}
                    </p>
                    {absence.notice ? (
                      <NoticeWarningBadges detail={absence.notice} />
                    ) : null}
                    {absence.reason ? (
                      <p className="mt-1 text-sm text-slate-600">
                        {absence.reason}
                      </p>
                    ) : null}
                  </div>
                  <Link
                    href={`/absence/${absence.id}`}
                    className="text-sm font-medium text-primary-hover hover:underline"
                  >
                    View
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </section>
  );
}

function MetricCard({
  label,
  value,
  detail,
  bar,
  valueClassName,
}: {
  label: string;
  value: string;
  detail?: string;
  bar?: string;
  valueClassName?: string;
}) {
  return (
    <li className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      {bar ? <div className={`h-1 ${bar}`} /> : <div className="h-1 bg-slate-200" />}
      <div className="p-4">
        <p className="text-sm font-medium text-slate-600">{label}</p>
        <p
          className={`mt-2 font-semibold tracking-tight text-slate-900 tabular-nums ${valueClassName ?? "text-3xl"}`}
        >
          {value}
        </p>
        {detail ? <p className="mt-2 text-sm text-slate-600">{detail}</p> : null}
      </div>
    </li>
  );
}

function FillRateBar({ summary }: { summary: EventAbsenceSummary }) {
  return (
    <div
      role="img"
      aria-label={`Estimated fill rate ${summary.fillRate} percent. Warning at ${summary.warningFillRate} percent. Critical at ${summary.criticalFillRate} percent.`}
    >
      <div className="pt-12">
        <div className="relative">
          <div className="h-3 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-3 rounded-full ${FILL_BAR[summary.fillStatus]}`}
              style={{ width: `${summary.fillRate}%` }}
            />
          </div>
          <ThresholdMark rate={summary.criticalFillRate} label="Critical" />
          <ThresholdMark
            rate={summary.warningFillRate}
            label="Warning"
            raised
          />
        </div>
      </div>
      <div className="mt-2 flex justify-between text-xs text-slate-500">
        <span>0%</span>
        <span className={`font-medium tabular-nums ${FILL_TEXT[summary.fillStatus]}`}>
          {summary.fillRate}%
        </span>
        <span>100%</span>
      </div>
    </div>
  );
}

function ThresholdMark({
  rate,
  label,
  raised = false,
}: {
  rate: number;
  label: string;
  raised?: boolean;
}) {
  const align =
    rate > 82 ? "right-0" : rate < 18 ? "left-0" : "left-1/2 -translate-x-1/2";
  return (
    <span
      className="pointer-events-none absolute inset-y-0 w-px bg-slate-800"
      style={{ left: `${rate}%` }}
    >
      <span
        className={`absolute whitespace-nowrap text-xs text-slate-600 ${align} ${raised ? "bottom-full mb-5" : "bottom-full mb-1"}`}
      >
        {label} {rate}%
      </span>
    </span>
  );
}

function TypeCount({
  label,
  count,
  swatch,
}: {
  label: string;
  count: number;
  swatch: string;
}) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-slate-700">
        <span className={`size-2 rounded-full ${swatch}`} aria-hidden="true" />
        {label}
      </span>
      <span className="tabular-nums font-medium text-slate-900">{count}</span>
    </li>
  );
}

function HorizontalBars({
  rows,
  barClassName,
}: {
  rows: { label: string; count: number }[];
  barClassName: string;
}) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-slate-700">{row.label}</span>
            <span className="font-medium tabular-nums text-slate-900">
              {row.count}
            </span>
          </div>
          <div
            className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"
            role="presentation"
          >
            <div
              className={`h-2 rounded-full ${barClassName}`}
              style={{
                width: row.count === 0 ? "0%" : `${(row.count / max) * 100}%`,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function averageNoticeValue(summary: EventAbsenceSummary): string {
  if (summary.averageNoticeMinutes != null) {
    return formatDurationMinutes(summary.averageNoticeMinutes);
  }
  if (summary.averageNoticeCalendarDays != null) {
    return formatCalendarNotice(summary.averageNoticeCalendarDays);
  }
  return "—";
}

function averageNoticeDetail(summary: EventAbsenceSummary): string {
  if (
    summary.averageNoticeMinutes != null &&
    summary.averageNoticeCalendarDays != null
  ) {
    return `${formatCalendarNotice(summary.averageNoticeCalendarDays)} average by date`;
  }
  if (summary.averageNoticeCalendarDays != null) {
    return "Average by date. No exact times were recorded.";
  }
  return "No cancellations logged.";
}
