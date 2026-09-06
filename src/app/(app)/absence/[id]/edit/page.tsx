import { notFound } from "next/navigation";
import { CancellationForm } from "@/components/absence/cancellation-form";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
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
      <PageHeader
        breadcrumbs={[
          { href: `/absence/${absence.id}`, label: "Cancellation" },
          { label: "Correct" },
        ]}
        title="Correct cancellation"
        description="Changes are saved with a correction reason and remain in the audit history."
      />
      <Card className="mt-8 shadow-none">
        <CardBody className="p-6">
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
        </CardBody>
      </Card>
    </div>
  );
}
