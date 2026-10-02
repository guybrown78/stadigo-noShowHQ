import { FollowUpDueSummary } from "@/components/absence/follow-up-due-summary";
import { PageHeader } from "@/components/ui/page-header";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { countFollowUpsByDueState } from "@/lib/absence/follow-up-service";
import { getTenantTimezone } from "@/lib/absence/queries";
import { todayIsoInTimeZone } from "@/lib/absence/timezone";
import { parseLocalDate } from "@/lib/events/dates";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireTenant();
  let counts: { overdue: number; dueToday: number; upcoming: number } | null =
    null;
  try {
    const timeZone = await getTenantTimezone(prisma, user.tenantId);
    const today = parseLocalDate(todayIsoInTimeZone(timeZone));
    if (today) {
      counts = await countFollowUpsByDueState(prisma, user.tenantId, today);
    }
  } catch {
    counts = null;
  }

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Open follow-ups for this organisation. A wider summary of staffing and events will live here later."
      />
      {counts ? (
        <FollowUpDueSummary counts={counts} />
      ) : (
        <p className="mt-6 text-sm text-slate-600">
          Follow-up dates need a valid organisation timezone before counts can
          be shown.
        </p>
      )}
    </div>
  );
}
