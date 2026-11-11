import Link from "next/link";
import { Calendar, CalendarRange, ClipboardList, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { href: "/dashboard", label: "Dashboard" },
          { label: "Settings" },
        ]}
        title="Settings"
        description="Configure organisation defaults and preferences that NoShowHQ will use across this tenant."
      />

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Link href="/settings/probation" className="group">
          <Card className="h-full transition-colors group-hover:border-primary/40">
            <CardBody>
              <div className="flex items-start gap-3">
                <span className="inline-flex size-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <ShieldCheck className="size-4" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-base font-semibold text-foreground">
                    Probation
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    Set the default probation length used when new staff records
                    are created. Changing it does not rewrite existing dates.
                  </p>
                </div>
              </div>
            </CardBody>
          </Card>
        </Link>
        <Link href="/settings/sickness-evidence" className="group">
          <Card className="h-full transition-colors group-hover:border-primary/40">
            <CardBody>
              <div className="flex items-start gap-3">
                <span className="inline-flex size-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <ClipboardList className="size-4" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-base font-semibold text-foreground">
                    Sickness evidence
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    Fit note day and chase timing.
                  </p>
                </div>
              </div>
            </CardBody>
          </Card>
        </Link>
        <Link href="/settings/absence" className="group">
          <Card className="h-full transition-colors group-hover:border-primary/40">
            <CardBody>
              <div className="flex items-start gap-3">
                <span className="inline-flex size-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <SlidersHorizontal className="size-4" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-base font-semibold text-foreground">
                    Absence
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    Cancellation and sickness reasons, short notice, and the
                    cancellation and AWOL thresholds.
                  </p>
                </div>
              </div>
            </CardBody>
          </Card>
        </Link>
        <Link href="/settings/pay-periods" className="group">
          <Card className="h-full transition-colors group-hover:border-primary/40">
            <CardBody>
              <div className="flex items-start gap-3">
                <span className="inline-flex size-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <CalendarRange className="size-4" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-base font-semibold text-foreground">
                    Pay periods
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    Name the dates absence records are filed under. This does
                    not calculate wages.
                  </p>
                </div>
              </div>
            </CardBody>
          </Card>
        </Link>
        <Link href="/settings/events" className="group">
          <Card className="h-full transition-colors group-hover:border-primary/40">
            <CardBody>
              <div className="flex items-start gap-3">
                <span className="inline-flex size-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <Calendar className="size-4" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-base font-semibold text-foreground">
                    Venues
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    Manage venues used when creating or importing events. You
                    can also open this list from Events.
                  </p>
                </div>
              </div>
            </CardBody>
          </Card>
        </Link>
      </div>
    </div>
  );
}
