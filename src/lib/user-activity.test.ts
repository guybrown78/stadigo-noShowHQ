import { describe, expect, it } from "vitest";
import {
  ACTIVITY_THROTTLE_MS,
  formatAdminTimestamp,
  formatDateTimeDisplay,
  shouldTouchLastActiveAt,
} from "@/lib/user-activity";

describe("shouldTouchLastActiveAt", () => {
  const now = new Date("2026-09-06T16:00:00.000Z");

  it("touches when there is no previous activity", () => {
    expect(shouldTouchLastActiveAt(null, now)).toBe(true);
  });

  it("skips updates inside the throttle window", () => {
    const recent = new Date(now.getTime() - ACTIVITY_THROTTLE_MS + 1_000);
    expect(shouldTouchLastActiveAt(recent, now)).toBe(false);
  });

  it("touches once the throttle window has elapsed", () => {
    const stale = new Date(now.getTime() - ACTIVITY_THROTTLE_MS);
    expect(shouldTouchLastActiveAt(stale, now)).toBe(true);
  });
});

describe("formatDateTimeDisplay", () => {
  it("formats London wall time without locale-dependent month names", () => {
    expect(formatDateTimeDisplay(new Date("2026-09-06T15:52:00.000Z"))).toBe(
      "6 Sept 2026, 16:52",
    );
    expect(formatDateTimeDisplay(new Date("2026-01-01T00:05:00.000Z"))).toBe(
      "1 Jan 2026, 00:05",
    );
  });
});

describe("formatAdminTimestamp", () => {
  it("returns Never when the admin has no recorded time", () => {
    expect(formatAdminTimestamp(null)).toBe("Never");
  });
});
