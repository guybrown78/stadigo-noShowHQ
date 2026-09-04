import { describe, expect, it } from "vitest";
import { formatLocalDateDisplay, parseLocalDate } from "@/lib/events/dates";

describe("formatLocalDateDisplay", () => {
  it("formats UTC midnight calendar dates without locale-dependent month names", () => {
    expect(formatLocalDateDisplay(parseLocalDate("2026-09-03")!)).toBe(
      "3 Sept 2026",
    );
    expect(formatLocalDateDisplay(parseLocalDate("2026-01-01")!)).toBe(
      "1 Jan 2026",
    );
    expect(formatLocalDateDisplay(parseLocalDate("2026-12-31")!)).toBe(
      "31 Dec 2026",
    );
  });
});
