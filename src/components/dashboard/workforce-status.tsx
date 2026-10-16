import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import type { WorkforceCount } from "@/lib/absence/watchlists";
import { EMPLOYMENT_STATUS_LABELS } from "@/lib/staff/display";
import { staffListHref } from "@/lib/staff/url";

export function WorkforceStatus({ counts }: { counts: WorkforceCount[] }) {
  return (
    <section className="mt-8" aria-labelledby="workforce-status-heading">
      <Card>
        <CardHeader
          headingId="workforce-status-heading"
          title="Workforce status"
          description="People in this organisation, by their current employment status."
        />
        <CardBody>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {counts.map((item) => (
              <li key={item.status}>
                <Link
                  href={staffListHref({ employmentStatus: item.status })}
                  className="block rounded-lg border border-border px-4 py-3 hover:border-primary/40"
                >
                  <p className="text-sm text-slate-600">
                    {EMPLOYMENT_STATUS_LABELS[item.status]}
                  </p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                    {item.count}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </section>
  );
}
