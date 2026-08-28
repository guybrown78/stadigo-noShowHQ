import Link from "next/link";
import { acknowledgeProbationTaskAction } from "@/app/(app)/staff/actions";
import { SnoozeProbationTaskForm } from "@/components/staff/snooze-probation-form";
import { StaffSectionNav } from "@/components/staff/staff-section-nav";
import { ProbationLifecycleBadge } from "@/components/staff/staff-status-badge";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import {
  formatLocalDateDisplay,
  formatLocalDateIso,
  londonTodayIso,
} from "@/lib/events/dates";
import { addCalendarDays } from "@/lib/staff/probation";
import {
  formatStaffName,
  probationUrgencyCaption,
  TASK_STATE_LABELS,
} from "@/lib/staff/display";
import { deriveProbationLifecycle } from "@/lib/staff/lifecycle";
import {
  listProbationQueue,
  type ProbationQueueItem,
} from "@/lib/staff/queries";
import { listStaffNeedingProbationDates, reconcileLegacyProbations } from "@/lib/staff/reconcile-legacy";
import {
  countOpenProbationTasks,
  reconcileTenantProbationWork,
} from "@/lib/staff/tasks";
import { MAX_PROBATION_SNOOZE_DAYS } from "@/lib/staff/catalog";
import { parseLocalDate } from "@/lib/events/dates";

export const metadata = { title: "Probation queue" };

function QueueSection({
  title,
  empty,
  items,
  todayIso,
  showSnooze,
}: {
  title: string;
  empty: string;
  items: ProbationQueueItem[];
  todayIso: string;
  showSnooze: boolean;
}) {
  const today = parseLocalDate(todayIso);
  const maxSnooze = today
    ? formatLocalDateIso(addCalendarDays(today, MAX_PROBATION_SNOOZE_DAYS))
    : todayIso;

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {items.map((item) => {
            const lifecycle = deriveProbationLifecycle({
              status: item.status,
              completedAt: item.completedAt,
              reviewDueDate: item.reviewDueDate,
              currentEndDate: item.currentEndDate,
              todayIso,
            });
            const task = item.tasks[0] ?? null;
            const caption = probationUrgencyCaption(
              lifecycle,
              item.reviewDueDate,
              item.currentEndDate,
              todayIso,
            );
            return (
              <li
                key={item.id}
                className="rounded-lg border border-slate-200 bg-white p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs text-slate-500">
                      {item.staff.staffIdNumber}
                    </p>
                    <Link
                      href={`/staff/${item.staff.id}`}
                      className="mt-1 block font-semibold text-slate-900 hover:underline"
                    >
                      {formatStaffName(item.staff)}
                    </Link>
                    <p className="mt-1 text-sm text-slate-600">
                      {item.staff.roleTitle}
                      {item.staff.department
                        ? ` · ${item.staff.department}`
                        : ""}
                    </p>
                  </div>
                  {lifecycle ? (
                    <ProbationLifecycleBadge lifecycle={lifecycle} />
                  ) : null}
                </div>
                <dl className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                  <div>
                    End {formatLocalDateDisplay(item.currentEndDate)}
                  </div>
                  <div>
                    Review due {formatLocalDateDisplay(item.reviewDueDate)}
                  </div>
                  <div>{caption}</div>
                  <div>
                    Task:{" "}
                    {task ? TASK_STATE_LABELS[task.state] : "None yet"}
                  </div>
                </dl>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={`/staff/${item.staff.id}`}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
                  >
                    Open record
                  </Link>
                  <Link
                    href={`/staff/${item.staff.id}/probation/review`}
                    className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
                  >
                    Review probation
                  </Link>
                  {task ? (
                    <form action={acknowledgeProbationTaskAction}>
                      <input type="hidden" name="taskId" value={task.id} />
                      <input
                        type="hidden"
                        name="staffId"
                        value={item.staff.id}
                      />
                      <button
                        type="submit"
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
                      >
                        Acknowledge
                      </button>
                    </form>
                  ) : null}
                </div>
                {showSnooze && task ? (
                  <div className="mt-4 border-t border-slate-100 pt-3">
                    <SnoozeProbationTaskForm
                      taskId={task.id}
                      staffId={item.staff.id}
                      maxDate={maxSnooze}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default async function ProbationQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ acknowledged?: string; snoozed?: string }>;
}) {
  const user = await requireTenant();
  const flash = await searchParams;
  await reconcileLegacyProbations(prisma, user.tenantId);
  await reconcileTenantProbationWork(prisma, user.tenantId);
  const todayIso = londonTodayIso();
  const [queue, needsDates, openCount] = await Promise.all([
    listProbationQueue(prisma, user.tenantId, todayIso),
    listStaffNeedingProbationDates(prisma, user.tenantId),
    countOpenProbationTasks(prisma, user.tenantId, todayIso),
  ]);

  const hasWork =
    queue.overdue.total +
      queue.reviewDue.total +
      queue.upcoming.total +
      needsDates.length >
    0;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Probation
          </h1>
          <p className="mt-2 max-w-2xl text-slate-600">
            Shared in-app work for this organisation. Any administrator can
            acknowledge, snooze, or record a decision. Nothing is emailed or
            sent as SMS.
          </p>
        </div>
        <Link
          href="/staff/new"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Add staff member
        </Link>
      </div>
      <StaffSectionNav current="probation" probationCount={openCount} />

      {flash.acknowledged === "1" ? (
        <p
          className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
          role="status"
        >
          Reminder acknowledged. The case stays in the queue until a decision
          is recorded.
        </p>
      ) : null}
      {flash.snoozed === "1" ? (
        <p
          className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
          role="status"
        >
          Reminder snoozed.
        </p>
      ) : null}

      {!hasWork ? (
        <div className="mt-8 rounded-lg border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-800">
            There are no outstanding probation actions
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Due and overdue reviews will appear here for every administrator
            in this organisation.
          </p>
        </div>
      ) : (
        <>
          <QueueSection
            title={`Overdue (${queue.overdue.total})`}
            empty="No overdue probation reviews."
            items={queue.overdue.items}
            todayIso={todayIso}
            showSnooze={false}
          />
          <QueueSection
            title={`Review due (${queue.reviewDue.total})`}
            empty="No probation reviews currently due."
            items={queue.reviewDue.items}
            todayIso={todayIso}
            showSnooze
          />
          <QueueSection
            title={`Upcoming within 28 days (${queue.upcoming.total})`}
            empty="No upcoming reviews in the next 28 days."
            items={queue.upcoming.items}
            todayIso={todayIso}
            showSnooze
          />
          <section className="mt-8">
            <h2 className="text-lg font-semibold text-slate-900">
              Needs dates ({needsDates.length})
            </h2>
            {needsDates.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">
                No active probation records are missing dates.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {needsDates.map((member) => (
                  <li
                    key={member.id}
                    className="rounded-lg border border-slate-200 bg-white p-4"
                  >
                    <p className="font-mono text-xs text-slate-500">
                      {member.staffIdNumber}
                    </p>
                    <Link
                      href={`/staff/${member.id}`}
                      className="mt-1 block font-semibold text-slate-900 hover:underline"
                    >
                      {formatStaffName(member)}
                    </Link>
                    <p className="mt-1 text-sm text-slate-600">
                      Start or end dates are missing. Do not guess — open the
                      record and amend dates with a reason, or record a
                      review decision if enough information exists.
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
