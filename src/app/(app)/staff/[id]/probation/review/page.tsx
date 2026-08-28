import Link from "next/link";
import { notFound } from "next/navigation";
import { ReviewProbationForm } from "@/components/staff/review-probation-form";
import { StaffSectionNav } from "@/components/staff/staff-section-nav";
import { ProbationLifecycleBadge } from "@/components/staff/staff-status-badge";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import {
  formatLocalDateDisplay,
  formatLocalDateIso,
  londonTodayIso,
} from "@/lib/events/dates";
import {
  formatDurationSource,
  formatStaffName,
} from "@/lib/staff/display";
import { StaffAccessError } from "@/lib/staff/errors";
import { deriveProbationLifecycle } from "@/lib/staff/lifecycle";
import {
  currentProbation,
  getStaffForTenant,
} from "@/lib/staff/queries";
import { reconcileProbation } from "@/lib/staff/tasks";

export const metadata = { title: "Review probation" };

export default async function ReviewProbationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireTenant();
  const { id } = await params;
  let staff;
  try {
    staff = await getStaffForTenant(prisma, user.tenantId, id);
  } catch (error) {
    if (error instanceof StaffAccessError) {
      notFound();
    }
    throw error;
  }

  const probation = currentProbation(staff);
  if (!probation || probation.completedAt) {
    notFound();
  }

  await reconcileProbation(prisma, {
    tenantId: user.tenantId,
    probationId: probation.id,
  });

  const todayIso = londonTodayIso();
  const lifecycle = deriveProbationLifecycle({
    status: probation.status,
    completedAt: probation.completedAt,
    reviewDueDate: probation.reviewDueDate,
    currentEndDate: probation.currentEndDate,
    todayIso,
  });
  const name = formatStaffName(staff);

  return (
    <div>
      <p className="text-sm text-slate-500">
        <Link href="/staff" className="hover:underline">
          Staff
        </Link>
        <span aria-hidden="true"> / </span>
        <Link href={`/staff/${staff.id}`} className="hover:underline">
          {name}
        </Link>
        <span aria-hidden="true"> / </span>
        Review probation
      </p>
      <StaffSectionNav current="directory" />
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">
        Review probation
      </h1>
      <p className="mt-2 max-w-2xl text-slate-600">
        Record whether probation was passed, extended, or not continued. This
        does not send a message or change employment status automatically.
      </p>

      <dl className="mt-6 grid gap-4 rounded-lg border border-slate-200 bg-white p-6 sm:grid-cols-2">
        <div>
          <dt className="text-sm font-medium text-slate-500">Staff member</dt>
          <dd className="mt-1 text-slate-900">
            {name}{" "}
            <span className="font-mono text-slate-600">
              ({staff.staffIdNumber})
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-sm font-medium text-slate-500">Current state</dt>
          <dd className="mt-1">
            {lifecycle ? <ProbationLifecycleBadge lifecycle={lifecycle} /> : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-sm font-medium text-slate-500">Start date</dt>
          <dd className="mt-1">{formatLocalDateDisplay(probation.startDate)}</dd>
        </div>
        <div>
          <dt className="text-sm font-medium text-slate-500">Effective duration</dt>
          <dd className="mt-1">
            {formatDurationSource(
              probation.durationSource,
              probation.effectiveDurationDays,
            )}
          </dd>
        </div>
        <div>
          <dt className="text-sm font-medium text-slate-500">Current end date</dt>
          <dd className="mt-1">
            {formatLocalDateDisplay(probation.currentEndDate)}
          </dd>
        </div>
        <div>
          <dt className="text-sm font-medium text-slate-500">Review due date</dt>
          <dd className="mt-1">
            {formatLocalDateDisplay(probation.reviewDueDate)}
          </dd>
        </div>
      </dl>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6">
        <ReviewProbationForm
          staffId={staff.id}
          todayIso={todayIso}
          currentEndIso={formatLocalDateIso(probation.currentEndDate)}
        />
      </div>
    </div>
  );
}
