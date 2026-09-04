import Link from "next/link";
import { notFound } from "next/navigation";
import { CancellationForm } from "@/components/absence/cancellation-form";
import { AbsenceAccessError } from "@/lib/absence/errors";
import {
  getAbsenceForTenant,
  getEventOptionForAbsence,
} from "@/lib/absence/queries";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { formatLocalDateIso, londonTodayIso } from "@/lib/events/dates";

export const metadata = { title: "Correct cancellation" };

export default async function CorrectCancellationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireTenant();
  const { id } = await params;

  let absence;
  try {
    absence = await getAbsenceForTenant(prisma, user.tenantId, id);
  } catch (error) {
    if (error instanceof AbsenceAccessError) {
      notFound();
    }
    throw error;
  }

  if (
    absence.type !== "CANCELLATION" ||
    absence.recordStatus === "ARCHIVED" ||
    !absence.cancellation
  ) {
    notFound();
  }

  const initialStaff = absence.staff.deletedAt
    ? null
    : {
        id: absence.staff.id,
        staffIdNumber: absence.staff.staffIdNumber,
        firstName: absence.staff.firstName,
        lastName: absence.staff.lastName,
        roleTitle: absence.staff.roleTitle,
        employmentStatus: absence.staff.employmentStatus,
      };
  const initialEvent = absence.eventId
    ? await getEventOptionForAbsence(prisma, user.tenantId, absence.eventId)
    : null;

  return (
    <div>
      <p className="text-sm text-slate-500">
        <Link href={`/absence/${absence.id}`} className="hover:underline">
          Cancellation
        </Link>
        <span aria-hidden="true"> / </span>
        Correct
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
        Correct cancellation
      </h1>
      <p className="mt-2 max-w-2xl text-slate-600">
        Changes are saved with a correction reason and remain in the audit
        history.
      </p>
      <div className="mt-8 rounded-lg border border-slate-200 bg-white p-6">
        <CancellationForm
          mode="edit"
          absenceId={absence.id}
          defaultReportedDate={londonTodayIso()}
          initialStaff={initialStaff}
          initialEvent={
            initialEvent ?? {
              id: absence.eventId ?? "",
              name: absence.cancellation.eventNameSnapshot,
              reference: absence.event?.reference ?? null,
              eventDate: formatLocalDateIso(
                absence.cancellation.eventDateSnapshot,
              ),
              startTime: absence.cancellation.eventStartTimeSnapshot,
              venueName: absence.cancellation.venueNameSnapshot ?? "",
              eventTypeName: absence.event?.eventType.name ?? "Event",
              eventSubtypeName: absence.event?.eventSubtype.name ?? "",
            }
          }
          initialValues={{
            reportedDate: formatLocalDateIso(absence.reportedDate),
            reportedTime: absence.reportedTime,
            reason: absence.reason,
            notes: absence.notes,
          }}
        />
      </div>
    </div>
  );
}
