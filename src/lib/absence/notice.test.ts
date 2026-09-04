import { describe, expect, it } from "vitest";
import {
  calculateNotice,
  coerceLocalDateIso,
  londonWallClockToUtc,
  previewNotice,
} from "@/lib/absence/notice";

describe("londonWallClockToUtc", () => {
  it("converts BST wall-clock time without shifting the local hour", () => {
    const instant = londonWallClockToUtc("2026-09-12", "14:00");
    expect(instant.toISOString()).toBe("2026-09-12T13:00:00.000Z");
  });

  it("converts GMT wall-clock time without shifting the local hour", () => {
    const instant = londonWallClockToUtc("2026-01-15", "14:00");
    expect(instant.toISOString()).toBe("2026-01-15T14:00:00.000Z");
  });
});

describe("calculateNotice", () => {
  it("uses calendar-date mode when times are missing", () => {
    const result = calculateNotice({
      eventDate: "2026-09-12",
      eventStartTime: "14:00",
      reportedDate: "2026-09-10",
      reportedTime: null,
    });
    expect(result).toMatchObject({
      noticeCalendarDays: 2,
      noticeMinutes: null,
      noticeBasis: "CALENDAR_DATE",
      isShortNotice: false,
      isRetrospective: false,
    });
  });

  it("uses exact-time mode when both times exist", () => {
    const result = calculateNotice({
      eventDate: "2026-09-12",
      eventStartTime: "14:00",
      reportedDate: "2026-09-11",
      reportedTime: "14:00",
    });
    expect(result).toMatchObject({
      noticeCalendarDays: 1,
      noticeMinutes: 24 * 60,
      noticeBasis: "EXACT_TIME",
      isShortNotice: false,
      isRetrospective: false,
    });
  });

  it("flags exact notice under 24 hours as short notice", () => {
    const result = calculateNotice({
      eventDate: "2026-09-12",
      eventStartTime: "14:00",
      reportedDate: "2026-09-11",
      reportedTime: "14:01",
    });
    expect(result.noticeMinutes).toBe(23 * 60 + 59);
    expect(result.isShortNotice).toBe(true);
    expect(result.isRetrospective).toBe(false);
  });

  it("flags same-day calendar reports as short notice but not retrospective", () => {
    const result = calculateNotice({
      eventDate: "2026-09-12",
      eventStartTime: null,
      reportedDate: "2026-09-12",
      reportedTime: "09:00",
    });
    expect(result).toMatchObject({
      noticeCalendarDays: 0,
      noticeMinutes: null,
      noticeBasis: "CALENDAR_DATE",
      isShortNotice: true,
      isRetrospective: false,
    });
  });

  it("keeps negative calendar notice and requires retrospective confirmation", () => {
    const result = calculateNotice({
      eventDate: "2026-09-12",
      eventStartTime: null,
      reportedDate: "2026-09-13",
      reportedTime: null,
    });
    expect(result).toMatchObject({
      noticeCalendarDays: -1,
      noticeBasis: "CALENDAR_DATE",
      isShortNotice: true,
      isRetrospective: true,
    });
  });

  it("keeps negative exact notice after the event start", () => {
    const result = calculateNotice({
      eventDate: "2026-09-12",
      eventStartTime: "14:00",
      reportedDate: "2026-09-12",
      reportedTime: "15:00",
    });
    expect(result.noticeMinutes).toBe(-60);
    expect(result.isShortNotice).toBe(true);
    expect(result.isRetrospective).toBe(true);
  });

  it("does not treat an exact 25-hour gap as short notice", () => {
    const result = calculateNotice({
      eventDate: "2026-09-12",
      eventStartTime: "10:00",
      reportedDate: "2026-09-11",
      reportedTime: "09:00",
    });
    expect(result.noticeMinutes).toBe(25 * 60);
    expect(result.isShortNotice).toBe(false);
  });

  it("accepts ISO datetime strings by using the calendar date prefix", () => {
    const result = calculateNotice({
      eventDate: "2026-09-19T00:00:00.000Z",
      eventStartTime: "15:00",
      reportedDate: "2026-09-20T00:00:00.000Z",
      reportedTime: null,
    });
    expect(result).toMatchObject({
      noticeCalendarDays: -1,
      noticeBasis: "CALENDAR_DATE",
      isShortNotice: true,
      isRetrospective: true,
    });
  });
});

describe("previewNotice", () => {
  it("shows negative notice and retrospective for a report after the event date", () => {
    const result = previewNotice({
      eventDate: "2026-09-19",
      eventStartTime: "15:00",
      reportedDate: "2026-09-20",
      reportedTime: null,
    });
    expect(result).toMatchObject({
      noticeCalendarDays: -1,
      noticeMinutes: null,
      noticeBasis: "CALENDAR_DATE",
      isShortNotice: true,
      isRetrospective: true,
    });
  });

  it("returns null for incomplete or invalid dates instead of throwing", () => {
    expect(() =>
      previewNotice({
        eventDate: "2026-09-19",
        eventStartTime: "15:00",
        reportedDate: "20/09/2026",
        reportedTime: null,
      }),
    ).not.toThrow();
    expect(
      previewNotice({
        eventDate: "2026-09-19",
        eventStartTime: "15:00",
        reportedDate: "20/09/2026",
        reportedTime: null,
      }),
    ).toBeNull();
    expect(
      previewNotice({
        eventDate: "2026-09-19",
        eventStartTime: "15:00",
        reportedDate: "",
        reportedTime: null,
      }),
    ).toBeNull();
    expect(
      previewNotice({
        eventDate: null,
        eventStartTime: "15:00",
        reportedDate: "2026-09-20",
        reportedTime: null,
      }),
    ).toBeNull();
  });
});

describe("coerceLocalDateIso", () => {
  it("coerces Date and ISO datetime values to YYYY-MM-DD", () => {
    expect(coerceLocalDateIso("2026-09-19")).toBe("2026-09-19");
    expect(coerceLocalDateIso("2026-09-19T00:00:00.000Z")).toBe("2026-09-19");
    expect(coerceLocalDateIso(new Date("2026-09-19T00:00:00.000Z"))).toBe(
      "2026-09-19",
    );
    expect(coerceLocalDateIso("not-a-date")).toBeNull();
  });
});
