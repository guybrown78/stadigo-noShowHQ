import { describe, expect, it } from "vitest";
import { payPeriodContaining, previousPayPeriod } from "@/lib/absence/pay-period";

describe("payPeriodContaining", () => {
  it("uses a calendar month when the anchor is the 1st", () => {
    expect(payPeriodContaining("2026-10-12", 1)).toEqual({
      fromIso: "2026-10-01",
      toIso: "2026-10-31",
    });
  });

  it("starts on the chosen day and rolls into the next month", () => {
    expect(payPeriodContaining("2026-10-16", 16)).toEqual({
      fromIso: "2026-10-16",
      toIso: "2026-11-15",
    });
    expect(payPeriodContaining("2026-10-12", 16)).toEqual({
      fromIso: "2026-09-16",
      toIso: "2026-10-15",
    });
  });

  it("returns the period before the one that contains today", () => {
    expect(previousPayPeriod("2026-10-12", 1)).toEqual({
      fromIso: "2026-09-01",
      toIso: "2026-09-30",
    });
  });
});
