import Link from "next/link";
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
}: {
  title: string;
  description: string;
  rows: WatchStaff[];
  empty: string;
  fromIso?: string;
  toIso?: string;
  type: "cancellations" | "awol";
  dateField?: "reported" | "affected";
}) {
  const headingId = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <section className="mt-8" aria-labelledby={headingId}>
      <Card>
        <CardHeader headingId={headingId} title={title} description={description} />
        <CardBody>
          {rows.length === 0 ? (
            <p className="text-sm text-slate-600">{empty}</p>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((row) => (
                <li key={row.staffId} className="flex items-center justify-between gap-3 py-2">
                  <Link
                    href={ledgerListHref({
                      view: type,
                      q: row.staffIdNumber,
                      ...(dateField === "affected"
                        ? { affectedFrom: fromIso, affectedTo: toIso }
                        : { reportedFrom: fromIso, reportedTo: toIso }),
                    })}
                    className="font-medium text-slate-900 hover:underline"
                  >
                    {formatStaffName(row)}
                  </Link>
                  <span className="text-sm tabular-nums text-slate-600">
                    {row.count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </section>
  );
}
