import { describe, expect, it } from "vitest";
import {
  DATE_RECORDED_BEFORE_EVENT_MESSAGE,
  DATE_RECORDED_FUTURE_MESSAGE,
  EVENT_NOT_STARTED_MESSAGE,
  FUTURE_EVENT_MESSAGE,
  SAME_DAY_CONFIRMATION_MESSAGE,
  evaluateAwolEventEligibility,
  evaluateAwolReportedDate,
} from "@/lib/absence/eligibility";
import { TENANT_TIMEZONE_ERROR } from "@/lib/absence/timezone";

const london = "Europe/London";

describe("evaluateAwolEventEligibility", () => {
  it("allows a past Event", () => {
    const result = evaluateAwolEventEligibility({
      eventDate: "2026-05-01",
      eventStartTime: "19:00",
      sameDayStartUnknownConfirmed: false,
      timeZone: london,
      now: new Date("2026-05-02T12:00:00.000Z"),
    });
    expect(result).toEqual({ ok: true, requiresSameDayConfirmation: false });
  });

  it("rejects a future Event", () => {
    const result = evaluateAwolEventEligibility({
      eventDate: "2026-05-03",
      eventStartTime: "19:00",
      sameDayStartUnknownConfirmed: false,
      timeZone: london,
      now: new Date("2026-05-02T12:00:00.000Z"),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toBe(FUTURE_EVENT_MESSAGE);
  });

  it("rejects a same-day Event before a known start time", () => {
    // 13:00 UTC = 14:00 BST on 2026-05-02.
    const result = evaluateAwolEventEligibility({
      eventDate: "2026-05-02",
      eventStartTime: "15:00",
      sameDayStartUnknownConfirmed: false,
      timeZone: london,
      now: new Date("2026-05-02T13:00:00.000Z"),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toBe(EVENT_NOT_STARTED_MESSAGE);
  });

  it("allows a same-day Event at or after a known start time", () => {
    const result = evaluateAwolEventEligibility({
      eventDate: "2026-05-02",
      eventStartTime: "14:00",
      sameDayStartUnknownConfirmed: false,
      timeZone: london,
      now: new Date("2026-05-02T13:00:00.000Z"),
    });
    expect(result).toEqual({ ok: true, requiresSameDayConfirmation: false });
  });

  it("requires confirmation for a same-day Event with no start time", () => {
    const missing = evaluateAwolEventEligibility({
      eventDate: "2026-05-02",
      eventStartTime: null,
      sameDayStartUnknownConfirmed: false,
      timeZone: london,
      now: new Date("2026-05-02T13:00:00.000Z"),
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.message).toBe(SAME_DAY_CONFIRMATION_MESSAGE);
    }

    const confirmed = evaluateAwolEventEligibility({
      eventDate: "2026-05-02",
      eventStartTime: null,
      sameDayStartUnknownConfirmed: true,
      timeZone: london,
      now: new Date("2026-05-02T13:00:00.000Z"),
    });
    expect(confirmed).toEqual({
      ok: true,
      requiresSameDayConfirmation: true,
    });
  });

  it("fails closed for an invalid tenant timezone", () => {
    const result = evaluateAwolEventEligibility({
      eventDate: "2026-05-01",
      eventStartTime: "19:00",
      sameDayStartUnknownConfirmed: false,
      timeZone: "Not/AZone",
      now: new Date("2026-05-02T12:00:00.000Z"),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toBe(TENANT_TIMEZONE_ERROR);
  });

  it("uses Europe/London DST so BST wall-clock start times are not shifted", () => {
    const before = evaluateAwolEventEligibility({
      eventDate: "2026-03-29",
      eventStartTime: "02:00",
      sameDayStartUnknownConfirmed: false,
      timeZone: london,
      now: new Date("2026-03-29T00:30:00.000Z"),
    });
    expect(before.ok).toBe(false);

    const after = evaluateAwolEventEligibility({
      eventDate: "2026-03-29",
      eventStartTime: "02:00",
      sameDayStartUnknownConfirmed: false,
      timeZone: london,
      now: new Date("2026-03-29T01:00:00.000Z"),
    });
    expect(after.ok).toBe(true);
  });
});

describe("evaluateAwolReportedDate", () => {
  it("accepts Date recorded on or after the Event date and not in the future", () => {
    const sameDay = evaluateAwolReportedDate({
      reportedDate: "2026-05-01",
      eventDate: "2026-05-01",
      timeZone: london,
      now: new Date("2026-05-02T12:00:00.000Z"),
    });
    expect(sameDay.ok).toBe(true);

    const later = evaluateAwolReportedDate({
      reportedDate: "2026-05-02",
      eventDate: "2026-05-01",
      timeZone: london,
      now: new Date("2026-05-02T12:00:00.000Z"),
    });
    expect(later.ok).toBe(true);
  });

  it("rejects Date recorded before the Event date", () => {
    const result = evaluateAwolReportedDate({
      reportedDate: "2026-04-30",
      eventDate: "2026-05-01",
      timeZone: london,
      now: new Date("2026-05-02T12:00:00.000Z"),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toBe(DATE_RECORDED_BEFORE_EVENT_MESSAGE);
  });

  it("rejects a future Date recorded", () => {
    const result = evaluateAwolReportedDate({
      reportedDate: "2026-05-03",
      eventDate: "2026-05-01",
      timeZone: london,
      now: new Date("2026-05-02T12:00:00.000Z"),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toBe(DATE_RECORDED_FUTURE_MESSAGE);
  });
});
