import Link from "next/link";
import { PayPeriodSettingsForms } from "@/components/settings/pay-period-settings-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { formatPayPeriodName } from "@/lib/absence/pay-period";
import { listPayPeriods } from "@/lib/absence/pay-periods";
import { ledgerListHref } from "@/lib/absence/url";
import { formatLocalDateDisplay, parseLocalDate } from "@/lib/events/dates";

export const metadata = { title: "Pay periods" };

function displayDate(iso: string): string {
  const date = parseLocalDate(iso);
  return date ? formatLocalDateDisplay(date) : iso;
}

export default async function PayPeriodsSettingsPage() {
  const user = await requireTenant();
  const periods = await listPayPeriods(prisma, user.tenantId);
  const open = periods.find((period) => period.status === "OPEN") ?? null;
  const upcoming = periods
    .filter((period) => period.status === "SCHEDULED")
    .sort((left, right) => left.startsOn.localeCompare(right.startsOn));
  const closed = periods.filter((period) => period.status === "CLOSED");

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { href: "/dashboard", label: "Dashboard" },
          { href: "/settings", label: "Settings" },
          { label: "Pay periods" },
        ]}
        title="Pay periods"
        description="Group absence records into the periods this organisation works to. This does not calculate wages."
      />

      <PayPeriodSettingsForms openPeriod={open} upcomingCount={upcoming.length} />

      {upcoming.length > 0 ? (
        <Card className="mt-8 shadow-none">
          <CardHeader
            headingId="upcoming-pay-periods-heading"
            title="Upcoming periods"
            description={
              open
                ? `Period ${open.number} stays current until the next one starts.`
                : "These become current on their start date."
            }
          />
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-border text-left text-slate-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">Period</th>
                    <th className="px-6 py-3 font-medium">Dates</th>
                    <th className="px-6 py-3 font-medium">
                      <span className="sr-only">When</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {upcoming.map((period, index) => (
                    <tr key={period.id} className="border-b border-border last:border-0">
                      <td className="px-6 py-3 font-medium text-slate-900">
                        {formatPayPeriodName(period)}
                      </td>
                      <td className="px-6 py-3 text-slate-700">
                        {displayDate(period.startsOn)} to {displayDate(period.endsOn)}
                      </td>
                      <td className="px-6 py-3">
                        {index === 0 ? <Badge tone="info">Next</Badge> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {closed.length > 0 ? (
        <Card className="mt-8 shadow-none">
          <CardHeader
            headingId="closed-pay-periods-heading"
            title="Closed periods"
            description="Closed periods stay available. Their records are not removed."
          />
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-border text-left text-slate-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">Period</th>
                    <th className="px-6 py-3 font-medium">Dates</th>
                    <th className="px-6 py-3 font-medium">Records</th>
                    <th className="px-6 py-3 font-medium">
                      <span className="sr-only">Ledger</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {closed.map((period) => (
                    <tr key={period.id} className="border-b border-border last:border-0">
                      <td className="px-6 py-3 font-medium text-slate-900">
                        {formatPayPeriodName(period)}
                      </td>
                      <td className="px-6 py-3 text-slate-700">
                        {displayDate(period.startsOn)} to {displayDate(period.endsOn)}
                      </td>
                      <td className="px-6 py-3 tabular-nums text-slate-700">
                        {period.absenceCount}
                      </td>
                      <td className="px-6 py-3">
                        <Link
                          href={ledgerListHref({ period: period.id })}
                          className="font-medium text-primary-hover hover:underline"
                        >
                          View records
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
