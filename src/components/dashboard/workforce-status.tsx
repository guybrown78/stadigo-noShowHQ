import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Tally, TallyCell } from "@/components/ui/tally";
import type { WorkforceCount } from "@/lib/absence/watchlists";
import { EMPLOYMENT_STATUS_LABELS } from "@/lib/staff/display";
import { staffListHref } from "@/lib/staff/url";

export function WorkforceStatus({ counts }: { counts: WorkforceCount[] }) {
  return (
    <section className="mt-8" aria-labelledby="workforce-status-heading">
      <Card className="overflow-hidden">
        <CardHeader
          headingId="workforce-status-heading"
          title="Workforce status"
          description="People in this organisation, by their current employment status."
        />
        <CardBody className="p-0">
          <Tally columns={5} framed={false}>
            {counts.map((item) => (
              <TallyCell
                key={item.status}
                href={staffListHref({ employmentStatus: item.status })}
                label={EMPLOYMENT_STATUS_LABELS[item.status]}
                value={item.count}
                action="Open staff"
              />
            ))}
          </Tally>
        </CardBody>
      </Card>
    </section>
  );
}
