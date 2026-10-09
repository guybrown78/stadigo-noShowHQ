import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { EventAbsenceMetrics } from "@/components/events/event-absence-metrics";
import type { EventAbsenceReportRow } from "@/lib/absence/queries";

const ada: EventAbsenceReportRow["staff"] = {
  id: "staff-ada",
  firstName: "Ada",
  lastName: "Lovelace",
  staffIdNumber: "CC-1",
};

const grace: EventAbsenceReportRow["staff"] = {
  id: "staff-grace",
  firstName: "Grace",
  lastName: "Hopper",
  staffIdNumber: "CC-2",
};

function renderReport(
  absences: EventAbsenceReportRow[],
  options?: { archivedCount?: number; staffRequired?: number },
) {
  return renderToStaticMarkup(
    <EventAbsenceMetrics
      staffRequired={options?.staffRequired ?? 10}
      warningFillRate={90}
      criticalFillRate={85}
      absences={absences}
      archivedCount={options?.archivedCount ?? 0}
    />,
  );
}

describe("EventAbsenceMetrics", () => {
  it("shows a full estimate when the event has no absences", () => {
    const html = renderReport([]);
    expect(html).toContain("Absence report");
    expect(html).toContain("100%");
    expect(html).toContain("At or above the warning threshold");
    expect(html).toContain("No absences logged.");
    expect(html).toContain(
      "No active cancellations or AWOLs are logged against this event.",
    );
    expect(html).toContain("Sickness is not recorded against an event");
  });

  it("reports fill rate, notice, reasons, and the people on the event", () => {
    const html = renderReport([
      {
        id: "absence-1",
        type: "CANCELLATION",
        reason: "Double booked",
        staff: ada,
        notice: {
          noticeCalendarDays: 1,
          noticeMinutes: 18 * 60,
          noticeBasis: "EXACT_TIME",
          isShortNotice: true,
        },
      },
      {
        id: "absence-2",
        type: "AWOL",
        reason: null,
        staff: grace,
        notice: null,
      },
    ]);

    expect(html).toContain("80%");
    expect(html).toContain("Below the critical threshold");
    expect(html).toContain("8 of 10 required staff still covered.");
    expect(html).toContain("18 hours");
    expect(html).toContain("1 day average by date");
    expect(html).toContain("Double booked");
    expect(html).toContain("12–24 hours");
    expect(html).toContain("1–3 days");
    expect(html).toContain('href="/staff/staff-ada"');
    expect(html).toContain("Ada Lovelace");
    expect(html).toContain('href="/staff/staff-grace"');
    expect(html).toContain("Grace Hopper");
    expect(html).toContain("Notice —");
    expect(html).toContain('href="/absence/absence-1"');
  });

  it("calls out date-only cancellations and archived records", () => {
    const html = renderReport(
      [
        {
          id: "absence-3",
          type: "CANCELLATION",
          reason: null,
          staff: ada,
          notice: {
            noticeCalendarDays: 0,
            noticeMinutes: null,
            noticeBasis: "CALENDAR_DATE",
            isShortNotice: true,
          },
        },
      ],
      { archivedCount: 2 },
    );

    expect(html).toContain("2 archived absences are excluded from this report.");
    expect(html).toContain(
      "1 cancellation was recorded by date only and is not in these hour buckets.",
    );
    expect(html).toContain("Same day");
  });

  it("floors the estimate when absences exceed the requirement", () => {
    const html = renderReport(
      [
        {
          id: "absence-4",
          type: "AWOL",
          reason: null,
          staff: ada,
          notice: null,
        },
        {
          id: "absence-5",
          type: "AWOL",
          reason: null,
          staff: grace,
          notice: null,
        },
      ],
      { staffRequired: 1 },
    );

    expect(html).toContain(
      "Logged absences exceed the staff requirement, so the estimate is 0%.",
    );
  });
});
