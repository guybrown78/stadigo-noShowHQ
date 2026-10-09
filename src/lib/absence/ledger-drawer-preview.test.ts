import { describe, expect, it } from "vitest";
import { ABSENCE_DETAIL_LABEL } from "@/lib/absence/display";
import type { LedgerAbsenceRow } from "@/lib/absence/ledger-query";
import { toLedgerDrawerPreview } from "@/lib/absence/ledger-drawer-preview";
import { formatLocalDateDisplay } from "@/lib/events/dates";

const reported = new Date("2026-09-14T00:00:00.000Z");

function row(
  overrides: Partial<LedgerAbsenceRow> & Pick<LedgerAbsenceRow, "type">,
): LedgerAbsenceRow {
  return {
    id: "abs-1",
    recordStatus: "ACTIVE",
    reportedDate: reported,
    reportedTime: null,
    createdAt: reported,
    firstWorkingDaySick: null,
    staff: {
      id: "staff-live",
      firstName: "Live",
      lastName: "Person",
      staffIdNumber: "LIVE-1",
      deletedAt: null,
    },
    event: null,
    cancellation: null,
    awol: null,
    sickness: null,
    recordedDate: reported,
    affectedDate: reported,
    issueSummaryPresent: false,
    ...overrides,
  };
}

describe("toLedgerDrawerPreview", () => {
  it("shows sickness dates from the row and keeps issue summary text off the preview", () => {
    const preview = toLedgerDrawerPreview(
      row({
        id: "sick-1",
        type: "SICKNESS",
        issueSummaryPresent: true,
        firstWorkingDaySick: reported,
        sickness: {
          firstWorkingDaySick: reported,
          sicknessStartedDate: null,
          sicknessEndedDate: null,
          episodeState: "ONGOING",
          staffFirstNameSnapshot: "Jamie",
          staffLastNameSnapshot: "Cole",
          staffIdNumberSnapshot: "ST-9",
        },
      }),
    );

    expect(preview.staffName).toBe("Jamie Cole");
    expect(preview.staffIdNumber).toBe("ST-9");
    expect(preview.heading).toBe("Ongoing");
    expect(preview.fullPageLabel).toBe("View full sickness page");
    expect(preview.fields.map((field) => field.label)).toEqual([
      ABSENCE_DETAIL_LABEL.recordStatus,
      ABSENCE_DETAIL_LABEL.episodeStatus,
      ABSENCE_DETAIL_LABEL.dateSicknessReported,
      ABSENCE_DETAIL_LABEL.firstDaySick,
      ABSENCE_DETAIL_LABEL.sicknessStarted,
    ]);
    expect(preview.fields.find((field) => field.label === ABSENCE_DETAIL_LABEL.sicknessStarted)?.lines).toEqual([
      "Not recorded",
    ]);
    expect(preview.pendingLabels).toContain(ABSENCE_DETAIL_LABEL.issueSummary);
    expect(preview.sectionSkeletons).toEqual([
      "Evidence",
      "Return to work",
      "Follow-ups",
      "History",
    ]);
    expect(JSON.stringify(preview)).not.toContain("Issue summary recorded");
  });

  it("shows cancellation event, venue, and notice without the reason", () => {
    const preview = toLedgerDrawerPreview(
      row({
        id: "cancel-1",
        type: "CANCELLATION",
        reportedTime: "18:00",
        event: { id: "event-1", reference: "EV-1", deletedAt: null },
        cancellation: {
          eventNameSnapshot: "Arena Night",
          eventDateSnapshot: reported,
          venueIdSnapshot: "venue-1",
          venueNameSnapshot: "Arena",
          noticeMinutes: null,
          noticeCalendarDays: 3,
          noticeBasis: "CALENDAR_DATE",
          isShortNotice: false,
        },
      }),
    );

    expect(preview.fullPageLabel).toBe("View full cancellation page");
    expect(preview.fields.map((field) => field.label)).toEqual([
      ABSENCE_DETAIL_LABEL.event,
      ABSENCE_DETAIL_LABEL.venue,
      ABSENCE_DETAIL_LABEL.reported,
      ABSENCE_DETAIL_LABEL.noticeGiven,
    ]);
    expect(preview.fields[0]?.href).toBe("/events/event-1");
    expect(preview.fields[2]?.lines).toEqual([
      `${formatLocalDateDisplay(reported)} · 18:00`,
    ]);
    expect(preview.fields[3]?.lines).toEqual(["3 days"]);
    expect(preview.pendingLabels).toContain(ABSENCE_DETAIL_LABEL.reason);
    expect(preview.pendingLabels).toContain(ABSENCE_DETAIL_LABEL.internalNotes);
    expect(preview.sectionSkeletons).toEqual(["Follow-ups", "History"]);
  });

  it("shows AWOL event, venue, and reference without the notes", () => {
    const preview = toLedgerDrawerPreview(
      row({
        id: "awol-1",
        type: "AWOL",
        event: { id: "event-2", reference: "EV-2", deletedAt: new Date() },
        awol: {
          eventNameSnapshot: "Gate Shift",
          eventReferenceSnapshot: "EV-2",
          eventDateSnapshot: reported,
          venueIdSnapshot: "venue-2",
          venueNameSnapshot: "North Gate",
          eventTypeSnapshot: "Concert",
        },
      }),
    );

    expect(preview.fullPageLabel).toBe("View full AWOL page");
    expect(preview.fields[0]?.href).toBeUndefined();
    const details = preview.fields.find(
      (field) => field.label === ABSENCE_DETAIL_LABEL.eventDetails,
    );
    expect(details?.lines).toContain(
      `EV-2 · ${formatLocalDateDisplay(reported)}`,
    );
    expect(details?.lines).toContain("North Gate");
    expect(preview.pendingLabels).toContain(ABSENCE_DETAIL_LABEL.internalNotes);
    expect(preview.pendingLabels).not.toContain(ABSENCE_DETAIL_LABEL.reason);
  });
});
