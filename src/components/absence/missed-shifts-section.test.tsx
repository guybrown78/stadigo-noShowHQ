import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AbsenceDetail } from "@/lib/absence/queries";
import { parseRemoveMissedShiftFormData } from "@/lib/absence/missed-shift-schema";

vi.mock("@/app/(app)/absence/missed-shift-actions", () => ({
  addMissedShiftAction: vi.fn(),
  removeMissedShiftAction: vi.fn(),
}));

vi.mock("@/app/(app)/absence/actions", () => ({
  searchAbsenceEventsAction: vi.fn(async () => []),
}));

import { MissedShiftsSection } from "@/components/absence/missed-shifts-section";

function sickness(shifts: AbsenceDetail["missedShifts"]): AbsenceDetail {
  return {
    id: "absence-sickness",
    type: "SICKNESS",
    recordStatus: "ACTIVE",
    sickness: { episodeState: "ONGOING" },
    missedShifts: shifts,
  } as unknown as AbsenceDetail;
}

const friday = new Date("2026-09-11T00:00:00.000Z");
const saturday = new Date("2026-09-12T00:00:00.000Z");
const monday = new Date("2026-09-14T00:00:00.000Z");

function html(shifts: AbsenceDetail["missedShifts"]) {
  return renderToStaticMarkup(
    createElement(MissedShiftsSection, { absence: sickness(shifts) }),
  );
}

describe("Missed shifts section", () => {
  it("invites an administrator to add a shift when none are recorded", () => {
    const markup = html([]);
    expect(markup).toContain("Add shift");
    expect(markup).toContain("No booked shifts recorded.");
    expect(markup).toContain("Days with no booking are left out.");
  });

  it("lists each booked shift and leaves the day between them out", () => {
    const markup = html([
      {
        id: "fri",
        eventDateSnapshot: friday,
        eventStartTimeSnapshot: "18:00",
        eventEndTimeSnapshot: "22:00",
        eventNameSnapshot: "Friday night",
        eventReferenceSnapshot: "FRI",
        venueNameSnapshot: "North Gate",
      },
      {
        id: "sat",
        eventDateSnapshot: saturday,
        eventStartTimeSnapshot: "14:00",
        eventEndTimeSnapshot: "17:00",
        eventNameSnapshot: "Saturday match",
        eventReferenceSnapshot: null,
        venueNameSnapshot: "North Gate",
      },
      {
        id: "mon",
        eventDateSnapshot: monday,
        eventStartTimeSnapshot: null,
        eventEndTimeSnapshot: null,
        eventNameSnapshot: "Monday cover",
        eventReferenceSnapshot: null,
        venueNameSnapshot: null,
      },
    ] as AbsenceDetail["missedShifts"]);
    expect(markup).toContain(">3<");
    expect(markup).toContain("missed shifts");
    expect(markup).toContain("text-sickness");
    expect(markup).toContain("11/09/2026 · 18:00");
    expect(markup).toContain("12/09/2026 · 14:00");
    expect(markup).toContain("14/09/2026");
    expect(markup).not.toContain("13/09/2026");
    expect(markup).toContain("Friday night");
    expect(markup).toContain("Remove Friday night");
    expect(markup).not.toContain("North Gate");
    expect(markup).not.toContain("September 2026");
    expect(markup).not.toContain("Are you sure");
  });

  it("groups a long sickness by month and keeps every shift in the collection", () => {
    const markup = html([
      {
        id: "sep",
        eventDateSnapshot: friday,
        eventStartTimeSnapshot: null,
        eventEndTimeSnapshot: null,
        eventNameSnapshot: "Friday night",
        eventReferenceSnapshot: null,
        venueNameSnapshot: "North Gate",
      },
      {
        id: "oct",
        eventDateSnapshot: new Date("2026-10-02T00:00:00.000Z"),
        eventStartTimeSnapshot: "09:30",
        eventEndTimeSnapshot: null,
        eventNameSnapshot: "October cover",
        eventReferenceSnapshot: "OCT",
        venueNameSnapshot: "South Gate",
      },
    ] as AbsenceDetail["missedShifts"]);
    expect(markup).toContain("September 2026");
    expect(markup).toContain("October 2026");
    expect(markup).toContain("October cover");
    expect(markup).not.toContain("South Gate");
    expect(markup).not.toContain("OCT");
  });

  it("keeps saved shifts visible on an archived sickness and hides add and remove", () => {
    const archived = sickness([
      {
        id: "fri",
        eventDateSnapshot: friday,
        eventStartTimeSnapshot: "18:00",
        eventEndTimeSnapshot: null,
        eventNameSnapshot: "Friday night",
        eventReferenceSnapshot: null,
        venueNameSnapshot: "North Gate",
      },
    ] as AbsenceDetail["missedShifts"]);
    archived.recordStatus = "ARCHIVED";
    const markup = renderToStaticMarkup(
      createElement(MissedShiftsSection, { absence: archived }),
    );
    expect(markup).toContain("Friday night");
    expect(markup).not.toContain("Add shift");
    expect(markup).not.toContain("Remove Friday night");
  });

  it("accepts a remove from the sickness and the shift", () => {
    const form = new FormData();
    form.set("absenceId", "absence-sickness");
    form.set("shiftId", "fri");
    form.set("idempotencyKey", "idempotency-key");
    expect(parseRemoveMissedShiftFormData(form).success).toBe(true);
  });
});
