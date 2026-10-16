import { describe, expect, it } from "vitest";
import {
  formatLocalDateDisplay,
  formatLondonDateTime,
  parseLocalDate,
} from "@/lib/events/dates";

describe("formatLocalDateDisplay", () => {
  it("formats UTC midnight calendar dates without locale-dependent month names", () => {
    expect(formatLocalDateDisplay(parseLocalDate("2026-09-03")!)).toBe(
      "03/09/2026",
    );
    expect(formatLocalDateDisplay(parseLocalDate("2026-01-01")!)).toBe(
      "01/01/2026",
    );
    expect(formatLocalDateDisplay(parseLocalDate("2026-12-31")!)).toBe(
      "31/12/2026",
    );
  });
});

describe("formatLondonDateTime", () => {
  it("formats instants in Europe/London with numeric parts", () => {
    expect(formatLondonDateTime(new Date("2026-09-15T09:41:50.000Z"))).toBe(
      "15/09/2026, 10:41:50",
    );
  });
});
