import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AbsenceEventOption } from "@/lib/absence/queries";

vi.mock("@/app/(app)/absence/actions", () => ({
  searchAbsenceEventsAction: vi.fn(async () => []),
}));

import { MissedShiftDraft } from "@/components/absence/missed-shift-draft";

const friday: AbsenceEventOption = {
  id: "event-friday",
  name: "Friday night",
  reference: "FRI-1",
  eventDate: "2026-09-11",
  briefingTime: null,
  startTime: "19:00",
  endTime: "22:00",
  venueName: "Alexandra Palace",
  eventTypeName: "Sporting",
  eventSubtypeName: "Match",
};

const sunday: AbsenceEventOption = {
  ...friday,
  id: "event-sunday",
  name: "Sunday night",
  reference: "SUN-1",
  eventDate: "2026-09-13",
  startTime: "18:00",
};

describe("Missed shift draft", () => {
  it("lists the shifts named on the call and leaves the day between out", () => {
    const markup = renderToStaticMarkup(
      createElement(MissedShiftDraft, {
        shifts: [friday, sunday],
        onChange: () => undefined,
        errorId: "shifts-error",
      }),
    );
    expect(markup).toContain("11/09/2026 · 19:00");
    expect(markup).toContain("Friday night");
    expect(markup).toContain("13/09/2026 · 18:00");
    expect(markup).toContain("Sunday night");
    expect(markup).not.toContain("12/09/2026");
    expect(markup).toContain('name="missedShiftEventId"');
    expect(markup).toContain('value="event-friday"');
    expect(markup).toContain('value="event-sunday"');
    expect(markup).not.toContain('name="eventId"');
    expect(markup).toContain("2 missed shifts");
  });

  it("starts empty without a required shift field", () => {
    const markup = renderToStaticMarkup(
      createElement(MissedShiftDraft, {
        shifts: [],
        onChange: () => undefined,
        errorId: "shifts-error",
      }),
    );
    expect(markup).toContain("Days with no booking are left out.");
    expect(markup).not.toContain('name="missedShiftEventId"');
    expect(markup).not.toContain('name="eventId"');
    expect(markup).not.toContain("*");
  });
});
