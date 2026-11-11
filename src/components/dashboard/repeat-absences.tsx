"use client";

import Link from "next/link";
import { CountBar } from "@/components/dashboard/count-bar";
import { ShowAllButton, useListPreview } from "@/components/dashboard/list-preview";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import type { DashboardRepeatRow } from "@/lib/absence/dashboard-query";
import { formatStaffName } from "@/lib/staff/display";

export function RepeatAbsences({
  rows,
  filtersActive,
}: {
  rows: DashboardRepeatRow[];
  filtersActive: boolean;
}) {
  const preview = useListPreview(rows.length);
  const visible = rows.slice(0, preview.visibleCount);
  return (
    <section className="mt-8" aria-labelledby="repeat-absences-heading">
      <Card className="overflow-hidden">
        <CardHeader
          headingId="repeat-absences-heading"
          title="Repeated absences"
          description={
            filtersActive
              ? "Staff with 2 or more absences in this period. Cancellation and AWOL follow the venue and event filters. Sickness counts cover the dates only, because sickness is not recorded against an event."
              : "Staff with 2 or more absences in this period."
          }
        />
        {rows.length === 0 ? (
          <CardBody>
            <p className="text-sm text-muted">
              No staff member has more than one absence in this period.
            </p>
          </CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <caption className="sr-only">
                Staff with two or more absences in the selected period
              </caption>
              <thead className="border-b border-border text-muted">
                <tr>
                  <th scope="col" className="px-5 py-2.5 font-medium">
                    Staff
                  </th>
                  <CountHeader label="Cancellation" swatch="bg-cancel" />
                  <CountHeader label="AWOL" swatch="bg-awol" />
                  <CountHeader label="Sickness" swatch="bg-sickness" />
                  <th
                    scope="col"
                    className="px-4 py-2.5 text-right font-medium"
                  >
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const name = formatStaffName(row);
                  return (
                    <tr key={row.staffId} className="border-b border-row hover:bg-wash last:border-b-0">
                      <th scope="row" className="px-5 py-3 font-normal">
                        <Link
                          href={`/staff/${row.staffId}#absence-history`}
                          className="font-medium text-foreground hover:underline"
                          aria-label={`${name}, absence history`}
                        >
                          {name}
                        </Link>
                        <p className="mt-0.5 text-sm text-muted">
                          {row.roleTitle}
                        </p>
                        <CountBar
                          className="mt-2 max-w-48"
                          cancellation={row.cancellation}
                          awol={row.awol}
                          sickness={row.sickness}
                        />
                      </th>
                      <CountCell value={row.cancellation} />
                      <CountCell value={row.awol} />
                      <CountCell value={row.sickness} />
                      <td className="px-4 py-3 text-right font-semibold text-foreground tabular-nums">
                        {row.total}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <ShowAllButton
          total={rows.length}
          expanded={preview.expanded}
          onToggle={() => preview.setExpanded((open) => !open)}
          className="block w-full border-t border-border px-5 py-3 text-left"
        />
      </Card>
    </section>
  );
}

function CountHeader({ label, swatch }: { label: string; swatch: string }) {
  return (
    <th scope="col" className="px-4 py-2.5 text-right font-medium">
      <span className="inline-flex items-center justify-end gap-1.5">
        <span className={`size-2 rounded-sm ${swatch}`} aria-hidden="true" />
        {label}
      </span>
    </th>
  );
}

function CountCell({ value }: { value: number }) {
  return (
    <td className="px-4 py-3 text-right text-foreground tabular-nums">{value}</td>
  );
}
