import Link from "next/link";
import { Calendar, ShieldCheck } from "lucide-react";
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
                  <h2 className="text-base font-semibold text-slate-900">
                    Probation
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Set the default probation length used when new staff records
                    are created. Changing it does not rewrite existing dates.
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
                  <h2 className="text-base font-semibold text-slate-900">
                    Venues
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
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
