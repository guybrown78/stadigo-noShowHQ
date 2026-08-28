import Link from "next/link";
import { DeleteStaffDialog } from "@/components/staff/delete-staff-dialog";
import { StaffSectionNav } from "@/components/staff/staff-section-nav";
import {
  ClearanceStatusBadge,
  EmploymentStatusBadge,
  ProbationLifecycleBadge,
} from "@/components/staff/staff-status-badge";
import { RestartProbationDialog } from "@/components/staff/restart-probation-dialog";
import { acknowledgeProbationTaskAction } from "@/app/(app)/staff/actions";
import { SnoozeProbationTaskForm } from "@/components/staff/snooze-probation-form";
import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import {
  formatLocalDateDisplay,
  formatLocalDateIso,
  londonTodayIso,
  parseLocalDate,
} from "@/lib/events/dates";
import { addCalendarDays, calculatedProbationEndDate, calculatedReviewDueDate } from "@/lib/staff/probation";
import { MAX_PROBATION_SNOOZE_DAYS } from "@/lib/staff/catalog";
import {
  formatDurationSource,
  formatStaffName,
  PROBATION_ACTION_LABELS,
  TASK_STATE_LABELS,
  TASK_TYPE_LABELS,
} from "@/lib/staff/display";
import {
  deriveProbationLifecycle,
  isClosedProbationLifecycle,
} from "@/lib/staff/lifecycle";
import { StaffAccessError } from "@/lib/staff/errors";
import {
  currentOpenTask,
  currentProbation,
  getStaffForTenant,
  getTenantProbationDefault,
} from "@/lib/staff/queries";
import { reconcileProbation, countOpenProbationTasks } from "@/lib/staff/tasks";

export const metadata = { title: "Staff member" };

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-sm font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 text-slate-900">{children}</dd>
    </div>
  );
}

export default async function StaffDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    created?: string;
    updated?: string;
    reviewed?: string;
    amended?: string;
    restarted?: string;
    acknowledged?: string;
    snoozed?: string;
  }>;
}) {
  const user = await requireTenant();
  const { id } = await params;
  const flash = await searchParams;

  let staff;
  try {
    staff = await getStaffForTenant(prisma, user.tenantId, id);
  } catch (error) {
    if (error instanceof StaffAccessError) {
      notFound();
    }
    throw error;
  }

  if (currentProbation(staff)) {
    await reconcileProbation(prisma, {
      tenantId: user.tenantId,
      probationId: currentProbation(staff)!.id,
    });
    staff = await getStaffForTenant(prisma, user.tenantId, id);
  }
  const probation = currentProbation(staff);
  const todayIso = londonTodayIso();
  const [openCount, defaultProbationDays] = await Promise.all([
    countOpenProbationTasks(prisma, user.tenantId, todayIso),
    getTenantProbationDefault(prisma, user.tenantId),
  ]);
  const lifecycle = probation
    ? deriveProbationLifecycle({
        status: probation.status,
        completedAt: probation.completedAt,
        reviewDueDate: probation.reviewDueDate,
        currentEndDate: probation.currentEndDate,
        todayIso,
      })
    : staff.probationStatus === "NOT_APPLICABLE"
      ? null
      : deriveProbationLifecycle({
          status: staff.probationStatus,
          completedAt: null,
          reviewDueDate: staff.probationReviewDueDate,
          currentEndDate: staff.probationEndDate,
          todayIso,
        });
  const openTask = currentOpenTask(staff);
  const previouslyExtended = staff.probationHistory.some(
    (entry) => entry.action === "EXTENDED",
  );
  const canRestart =
    !staff.probations.some((row) => row.completedAt === null) &&
    Boolean(probation?.completedAt) &&
    (probation?.status === "PASSED" || probation?.status === "NOT_CONTINUED");
  const restartStart = parseLocalDate(todayIso);
  const restartEnd = restartStart
    ? calculatedProbationEndDate(restartStart, defaultProbationDays)
    : null;
  const restartReviewDue = restartEnd
    ? calculatedReviewDueDate(restartEnd)
    : null;
  const canSnooze =
    lifecycle !== "OVERDUE" &&
    openTask &&
    !isClosedProbationLifecycle(lifecycle);
  const today = parseLocalDate(todayIso);
  const maxSnooze = today
    ? formatLocalDateIso(addCalendarDays(today, MAX_PROBATION_SNOOZE_DAYS))
    : todayIso;
  const name = formatStaffName(staff);

  return (
    <div>
      <p className="text-sm text-slate-500">
        <Link href="/staff" className="hover:underline">
          Staff
        </Link>
        <span aria-hidden="true"> / </span>
        {name}
      </p>
      <StaffSectionNav current="directory" probationCount={openCount} />

      {flash.created === "1" ? (
        <p
          className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
          role="status"
        >
          Staff member created.
        </p>
      ) : null}
      {flash.reviewed === "1" ? (
        <p
          className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
          role="status"
        >
          Probation decision recorded.
        </p>
      ) : null}
      {flash.amended === "1" ? (
        <p
          className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
          role="status"
        >
          Probation end date amended.
        </p>
      ) : null}
      {flash.restarted === "1" ? (
        <p
          className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
          role="status"
        >
          New probation started. They are on probation again from today.
        </p>
      ) : null}
      {flash.acknowledged === "1" ? (
        <p
          className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
          role="status"
        >
          Reminder acknowledged.
        </p>
      ) : null}
      {flash.snoozed === "1" ? (
        <p
          className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
          role="status"
        >
          Reminder snoozed.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              {name}
            </h1>
            <EmploymentStatusBadge status={staff.employmentStatus} />
          </div>
          <p className="mt-2 font-mono text-lg text-slate-800">
            Staff ID {staff.staffIdNumber}
          </p>
          <p className="mt-1 text-slate-600">
            {staff.roleTitle}
            {staff.department ? ` · ${staff.department}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {probation && !probation.completedAt ? (
            <Link
              href={`/staff/${staff.id}/probation/review`}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Review probation
            </Link>
          ) : null}
          {canRestart && restartStart && restartEnd && restartReviewDue ? (
            <RestartProbationDialog
              staffId={staff.id}
              staffName={name}
              defaultDays={defaultProbationDays}
              startDateLabel={formatLocalDateDisplay(restartStart)}
              endDateLabel={formatLocalDateDisplay(restartEnd)}
              reviewDueLabel={formatLocalDateDisplay(restartReviewDue)}
            />
          ) : null}
          <Link
            href={`/staff/${staff.id}/edit`}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            Edit staff member
          </Link>
          <DeleteStaffDialog
            staffId={staff.id}
            staffName={name}
            staffIdNumber={staff.staffIdNumber}
          />
        </div>
      </div>

      <dl className="mt-8 grid gap-6 rounded-lg border border-slate-200 bg-white p-6 sm:grid-cols-2">
        <Detail label="Staff ID">
          <span className="font-mono">{staff.staffIdNumber}</span>
        </Detail>
        <Detail label="Employment status">
          <EmploymentStatusBadge status={staff.employmentStatus} />
        </Detail>
        <Detail label="First name">{staff.firstName}</Detail>
        <Detail label="Last name">{staff.lastName}</Detail>
        <Detail label="Email">{staff.email ?? "—"}</Detail>
        <Detail label="Phone">{staff.phone ?? "—"}</Detail>
        <Detail label="Role">{staff.roleTitle}</Detail>
        <Detail label="Department">{staff.department ?? "—"}</Detail>
        <Detail label="Manager">
          {staff.manager
            ? `${formatStaffName(staff.manager)} (${staff.manager.staffIdNumber})`
            : "—"}
        </Detail>
        <Detail label="Start date">
          {staff.startDate ? (
            <>
              {formatLocalDateDisplay(staff.startDate)}
              <span className="sr-only">
                {" "}
                {formatLocalDateIso(staff.startDate)}
              </span>
            </>
          ) : (
            "—"
          )}
        </Detail>
        <Detail label="Probation">
          {lifecycle ? (
            <div className="space-y-1">
              <ProbationLifecycleBadge lifecycle={lifecycle} />
              {previouslyExtended && !isClosedProbationLifecycle(lifecycle) ? (
                <p className="text-sm text-slate-500">Previously extended</p>
              ) : null}
            </div>
          ) : (
            "—"
          )}
        </Detail>
        <Detail label="Probation start">
          {probation
            ? formatLocalDateDisplay(probation.startDate)
            : staff.startDate
              ? formatLocalDateDisplay(staff.startDate)
              : "—"}
        </Detail>
        <Detail label="Effective duration">
          {probation
            ? formatDurationSource(
                probation.durationSource,
                probation.effectiveDurationDays,
              )
            : "—"}
        </Detail>
        <Detail label="Current end date">
          {probation
            ? formatLocalDateDisplay(probation.currentEndDate)
            : staff.probationEndDate
              ? formatLocalDateDisplay(staff.probationEndDate)
              : "—"}
        </Detail>
        <Detail label="Review due">
          {probation
            ? formatLocalDateDisplay(probation.reviewDueDate)
            : staff.probationReviewDueDate
              ? formatLocalDateDisplay(staff.probationReviewDueDate)
              : "—"}
        </Detail>
        <Detail label="Current task">
          {openTask
            ? `${TASK_TYPE_LABELS[openTask.type]} · ${TASK_STATE_LABELS[openTask.state]}`
            : "—"}
        </Detail>
        <Detail label="Security clearance">
          <ClearanceStatusBadge status={staff.securityClearanceStatus} />
        </Detail>
        <Detail label="Clearance expiry">
          {staff.securityClearanceExpiryDate
            ? formatLocalDateDisplay(staff.securityClearanceExpiryDate)
            : "—"}
        </Detail>
        <div className="sm:col-span-2">
          <dt className="text-sm font-medium text-slate-500">Notes</dt>
          <dd className="mt-1 whitespace-pre-wrap text-slate-900">
            {staff.notes ?? "—"}
          </dd>
        </div>
        <Detail label="Created">
          {staff.createdAt.toLocaleString("en-GB")}
        </Detail>
        <Detail label="Last updated">
          {staff.updatedAt.toLocaleString("en-GB")}
        </Detail>
      </dl>

      {openTask && probation && !probation.completedAt ? (
        <section className="mt-8 rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-900">
            In-app reminder
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            {TASK_TYPE_LABELS[openTask.type]} is {TASK_STATE_LABELS[openTask.state]}.
            Acknowledging records who acted but keeps the case visible.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <form action={acknowledgeProbationTaskAction}>
              <input type="hidden" name="taskId" value={openTask.id} />
              <input type="hidden" name="staffId" value={staff.id} />
              <button
                type="submit"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
              >
                Acknowledge
              </button>
            </form>
            <Link
              href={`/staff/${staff.id}/probation/review`}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
            >
              Review probation
            </Link>
          </div>
          {canSnooze ? (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <SnoozeProbationTaskForm
                taskId={openTask.id}
                staffId={staff.id}
                maxDate={maxSnooze}
              />
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">
              Snoozing is not available once probation is overdue.
            </p>
          )}
        </section>
      ) : null}

      {staff.probationHistory.length > 0 ? (
        <section className="mt-8 rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-900">
            Probation history
          </h2>
          <ul className="mt-4 divide-y divide-slate-100">
            {staff.probationHistory.map((entry) => (
              <li key={entry.id} className="py-3 text-sm text-slate-700">
                <p className="font-medium text-slate-900">
                  {PROBATION_ACTION_LABELS[entry.action]}
                </p>
                <p className="mt-1 text-slate-600">
                  {entry.createdAt.toLocaleString("en-GB")}
                  {` · ${
                    entry.systemActor || !entry.actedBy
                      ? "System"
                      : `${entry.actedBy.firstName} ${entry.actedBy.lastName}`
                  }`}
                </p>
                {entry.previousEndDate || entry.newEndDate ? (
                  <p className="mt-1 text-slate-600">
                    End date{" "}
                    {entry.previousEndDate
                      ? formatLocalDateDisplay(entry.previousEndDate)
                      : "none"}{" "}
                    →{" "}
                    {entry.newEndDate
                      ? formatLocalDateDisplay(entry.newEndDate)
                      : "none"}
                  </p>
                ) : null}
                {entry.notes ? (
                  <p className="mt-1 whitespace-pre-wrap text-slate-600">
                    {entry.notes}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-8 rounded-lg border border-dashed border-slate-300 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">
          Absence history
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Absence records will attach to this staff member in a later release.
          Nothing is recorded yet.
        </p>
      </section>
    </div>
  );
}
