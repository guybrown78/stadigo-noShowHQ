import { describe, expect, it } from "vitest";
import { payPeriodEndOn, payPeriodLabel, rangesOverlap } from "@/lib/absence/pay-period";

describe("payPeriodLabel", () => {
  it("names a full calendar month", () => {
    expect(payPeriodLabel("2026-10-01", "2026-10-31")).toBe("October 2026");
    expect(payPeriodLabel("2024-02-01", "2024-02-29")).toBe("February 2024");
  });

  it("names a seven-day span by its end date", () => {
    expect(payPeriodLabel("2026-10-05", "2026-10-11")).toBe(
      "Week ending 11 Oct 2026",
    );
  });

  it("names any other range from the start and end dates", () => {
    expect(payPeriodLabel("2026-10-12", "2026-10-25")).toBe(
      "12 Oct 2026 to 25 Oct 2026",
    );
  });

  it("rejects an end date before the start date", () => {
    expect(payPeriodLabel("2026-10-12", "2026-10-01")).toBeNull();
  });
});

describe("payPeriodEndOn", () => {
  it("counts the start date as the first day of the length", () => {
    expect(payPeriodEndOn("2026-10-19", "7")).toBe("2026-10-25");
    expect(payPeriodEndOn("2026-10-26", "14")).toBe("2026-11-08");
    expect(payPeriodEndOn("2026-10-05", "28")).toBe("2026-11-01");
  });

  it("fills a calendar month from the first, and a month from any other day", () => {
    expect(payPeriodEndOn("2026-10-01", "month")).toBe("2026-10-31");
    expect(payPeriodEndOn("2024-02-01", "month")).toBe("2024-02-29");
    expect(payPeriodEndOn("2026-10-26", "month")).toBe("2026-11-25");
    expect(payPeriodEndOn("2026-01-31", "month")).toBe("2026-02-27");
  });
});

describe("rangesOverlap", () => {
  it("treats touching ranges as an overlap and a gap as clear", () => {
    expect(
      rangesOverlap(
        { startsOnIso: "2026-10-01", endsOnIso: "2026-10-31" },
        { startsOnIso: "2026-10-31", endsOnIso: "2026-11-06" },
      ),
    ).toBe(true);
    expect(
      rangesOverlap(
        { startsOnIso: "2026-10-01", endsOnIso: "2026-10-31" },
        { startsOnIso: "2026-11-01", endsOnIso: "2026-11-30" },
      ),
    ).toBe(false);
  });
});
