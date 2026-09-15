import { notFound } from "next/navigation";
import { AwolForm } from "@/components/absence/awol-form";
import { CancellationForm } from "@/components/absence/cancellation-form";
import { SicknessForm } from "@/components/absence/sickness-form";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { AbsenceAccessError } from "@/lib/absence/errors";
import {
  getAbsenceForTenant,
  getEventOptionForAbsence,
} from "@/lib/absence/queries";
import { todayIsoInTimeZone } from "@/lib/absence/timezone";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { formatLocalDateIso } from "@/lib/events/dates";

export const metadata = { title: "Correct absence" };

export default async function CorrectAbsencePage({
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

  if (absence.recordStatus === "ARCHIVED") {
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
  const defaultReportedDate = todayIsoInTimeZone(user.tenantTimezone);

  if (absence.type === "AWOL" && absence.awol) {
    return (
      <div>
        <PageHeader
          breadcrumbs={[
            { href: `/absence/${absence.id}`, label: "AWOL" },
            { label: "Correct" },
          ]}
          title="Correct AWOL"
          description="Changes are saved with a correction reason and remain in the audit history."
        />
        <Card className="mt-8 shadow-none">
          <CardBody className="p-6">
            <AwolForm
              mode="edit"
              absenceId={absence.id}
              defaultReportedDate={defaultReportedDate}
              timeZone={user.tenantTimezone}
              expectedUpdatedAt={absence.updatedAt.toISOString()}
              initialStaff={initialStaff}
              initialEvent={
                initialEvent ?? {
                  id: absence.eventId ?? "",
                  name: absence.awol.eventNameSnapshot,
                  reference: absence.awol.eventReferenceSnapshot,
                  eventDate: formatLocalDateIso(absence.awol.eventDateSnapshot),
                  startTime: absence.awol.eventStartTimeSnapshot,
                  endTime: absence.awol.eventEndTimeSnapshot,
                  venueName: absence.awol.venueNameSnapshot ?? "",
                  eventTypeName: absence.awol.eventTypeSnapshot ?? "Unspecified",
                  eventSubtypeName: absence.awol.eventSubtypeSnapshot ?? "",
                }
              }
              initialValues={{
                reportedDate: formatLocalDateIso(absence.reportedDate),
                notes: absence.notes,
                sameDayStartUnknownConfirmed:
                  absence.awol.sameDayStartUnknownConfirmed,
              }}
            />
          </CardBody>
        </Card>
      </div>
    );
  }

  if (absence.type === "SICKNESS" && absence.sickness) {
    return (
      <div>
        <PageHeader
          breadcrumbs={[
            { href: `/absence/${absence.id}`, label: "Sickness" },
            { label: "Correct" },
          ]}
          title="Correct sickness report"
          description="Correction is for fixing the original report. Changes are saved with a correction reason and remain in the audit history."
        />
        <Card className="mt-8 shadow-none">
          <CardBody className="p-6">
            <SicknessForm
              mode="edit"
              absenceId={absence.id}
              defaultReportedDate={defaultReportedDate}
              timeZone={user.tenantTimezone}
              expectedUpdatedAt={absence.updatedAt.toISOString()}
              initialStaff={initialStaff}
              initialValues={{
                reportedDate: formatLocalDateIso(absence.reportedDate),
                firstWorkingDaySick: formatLocalDateIso(
                  absence.sickness.firstWorkingDaySick,
                ),
                sicknessStartedDate: absence.sickness.sicknessStartedDate
                  ? formatLocalDateIso(absence.sickness.sicknessStartedDate)
                  : "",
                issueSummary: absence.sickness.issueSummary,
              }}
            />
          </CardBody>
        </Card>
      </div>
    );
  }

  if (absence.type !== "CANCELLATION" || !absence.cancellation) {
    notFound();
  }

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
          defaultReportedDate={defaultReportedDate}
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
              endTime: null,
              venueName: absence.cancellation.venueNameSnapshot ?? "",
              eventTypeName: absence.event?.eventType.name ?? "Event",
              eventSubtypeName: absence.event?.eventSubtype.name ?? "",
            }
          }
          initialValues={{
            reportedDate: formatLocalDateIso(absence.reportedDate),
            reportedTime: absence.reportedTime,
            reason: absence.reason ?? "",
            notes: absence.notes,
          }}
        />
        </CardBody>
      </Card>
    </div>
  );
}
