"use client";

import Link from "next/link";
import { ShowAllButton, useListPreview } from "@/components/dashboard/list-preview";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import type { WatchStaff } from "@/lib/absence/watchlists";
import { ledgerListHref } from "@/lib/absence/url";
import { formatStaffName } from "@/lib/staff/display";

export function AttendanceWatchlist({
  title,
  description,
  rows,
  empty,
  fromIso,
  toIso,
  type,
  dateField = "reported",
  periodId,
}: {
  title: string;
  description: string;
  rows: WatchStaff[];
  empty: string;
  fromIso?: string;
  toIso?: string;
  type: "cancellations" | "awol";
  dateField?: "reported" | "affected";
  periodId?: string;
}) {
  const headingId = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const preview = useListPreview(rows.length);
  const visible = rows.slice(0, preview.visibleCount);
  return (
    <section className="mt-8" aria-labelledby={headingId}>
      <Card>
        <CardHeader headingId={headingId} title={title} description={description} />
        <CardBody>
          {rows.length === 0 ? (
            <p className="text-sm text-muted">{empty}</p>
          ) : (
            <ul className="divide-y divide-border">
              {visible.map((row) => (
                <li key={row.staffId} className="flex items-center justify-between gap-3 py-2">
                  <Link
                    href={ledgerListHref({
                      view: type,
                      q: row.staffIdNumber,
                      ...(periodId
                        ? { period: periodId }
                        : dateField === "affected"
                          ? { affectedFrom: fromIso, affectedTo: toIso }
                          : { reportedFrom: fromIso, reportedTo: toIso }),
                    })}
                    className="font-medium text-foreground hover:underline"
                  >
                    {formatStaffName(row)}
                  </Link>
                  <span className="text-sm tabular-nums text-muted">
                    {row.count}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <ShowAllButton
            total={rows.length}
            expanded={preview.expanded}
            onToggle={() => preview.setExpanded((open) => !open)}
            className="mt-3"
          />
        </CardBody>
      </Card>
    </section>
  );
}
