import { describe, expect, it } from "vitest";
import {
  buildDashboardBuckets,
  dashboardGrain,
  dashboardHref,
  formatDashboardSpan,
  formatDashboardSpanCompact,
  inclusiveDayCount,
  previousPeriod,
  resolveDashboardQuery,
} from "@/lib/absence/dashboard-range";

const today = "2026-10-08";

describe("dashboard presets", () => {
  it("defaults to the last 30 days ending today", () => {
    const result = resolveDashboardQuery({}, today);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.filters.range).toBe("last30");
    expect(result.range.fromIso).toBe("2026-09-09");
    expect(result.range.toIso).toBe("2026-10-08");
    expect(result.range.dayCount).toBe(30);
  });

  it("resolves last 7 days, this month, and the trailing 3 months", () => {
    const last7 = resolveDashboardQuery({ range: "last7" }, today);
    const month = resolveDashboardQuery({ range: "month" }, today);
    const months3 = resolveDashboardQuery({ range: "months3" }, today);
    expect(last7.ok && last7.range.fromIso).toBe("2026-10-02");
    expect(last7.ok && last7.range.toIso).toBe(today);
    expect(month.ok && month.range.fromIso).toBe("2026-10-01");
    expect(month.ok && month.range.dayCount).toBe(8);
    expect(months3.ok && months3.range.fromIso).toBe("2026-07-08");
    expect(months3.ok && months3.range.toIso).toBe(today);
  });

  it("clamps a month subtraction when the day does not exist", () => {
    const result = resolveDashboardQuery({ range: "months3" }, "2026-05-31");
    expect(result.ok && result.range.fromIso).toBe("2026-02-28");
  });

  it("keeps a preset when the submitted dates still match it", () => {
    const result = resolveDashboardQuery(
      { range: "last7", from: "2026-10-02", to: "2026-10-08" },
      today,
    );
    expect(result.ok && result.filters.range).toBe("last7");
  });

  it("treats edited preset dates as a custom range", () => {
    const result = resolveDashboardQuery(
      { range: "last30", from: "2026-09-01", to: "2026-09-30" },
      today,
    );
    expect(result.ok && result.filters.range).toBe("custom");
    expect(result.ok && result.range.fromIso).toBe("2026-09-01");
    expect(result.ok && result.range.toIso).toBe("2026-09-30");
  });
});

describe("previous period", () => {
  it("uses the inclusive window of the same length immediately before the start", () => {
    expect(previousPeriod("2026-09-01", "2026-09-30")).toEqual({
      fromIso: "2026-08-02",
      toIso: "2026-08-31",
    });
    expect(inclusiveDayCount("2026-09-01", "2026-09-30")).toBe(30);
    expect(inclusiveDayCount("2026-08-02", "2026-08-31")).toBe(30);
  });

  it("steps back one day for a single-day range", () => {
    expect(previousPeriod("2026-10-08", "2026-10-08")).toEqual({
      fromIso: "2026-10-07",
      toIso: "2026-10-07",
    });
  });

  it("crosses a leap day", () => {
    expect(previousPeriod("2024-03-01", "2024-03-01")).toEqual({
      fromIso: "2024-02-29",
      toIso: "2024-02-29",
    });
  });
});

describe("dashboard buckets", () => {
  it("uses a day for up to 14 days, a week up to 90, then a month", () => {
    expect(dashboardGrain(14)).toBe("day");
    expect(dashboardGrain(15)).toBe("week");
    expect(dashboardGrain(90)).toBe("week");
    expect(dashboardGrain(91)).toBe("month");
  });

  it("splits a month into Monday weeks clipped to the range", () => {
    const { grain, buckets } = buildDashboardBuckets("2026-09-01", "2026-09-30");
    expect(grain).toBe("week");
    expect(buckets.map((bucket) => [bucket.fromIso, bucket.toIso, bucket.label])).toEqual([
      ["2026-09-01", "2026-09-06", "1–6 Sept"],
      ["2026-09-07", "2026-09-13", "7–13 Sept"],
      ["2026-09-14", "2026-09-20", "14–20 Sept"],
      ["2026-09-21", "2026-09-27", "21–27 Sept"],
      ["2026-09-28", "2026-09-30", "28–30 Sept"],
    ]);
  });

  it("keeps a Monday-starting range on week boundaries", () => {
    const { buckets } = buildDashboardBuckets("2026-09-07", "2026-09-21");
    expect(buckets.map((bucket) => bucket.fromIso)).toEqual([
      "2026-09-07",
      "2026-09-14",
      "2026-09-21",
    ]);
    expect(buckets[2]?.label).toBe("21 Sept");
  });

  it("builds one bucket per day for a short range", () => {
    const { grain, buckets } = buildDashboardBuckets("2026-10-01", "2026-10-14");
    expect(grain).toBe("day");
    expect(buckets).toHaveLength(14);
    expect(buckets[0]).toMatchObject({
      fromIso: "2026-10-01",
      toIso: "2026-10-01",
      label: "1 Oct",
    });
  });

  it("groups a long range by calendar month", () => {
    const { grain, buckets } = buildDashboardBuckets("2026-01-15", "2026-04-20");
    expect(grain).toBe("month");
    expect(buckets.map((bucket) => [bucket.fromIso, bucket.toIso, bucket.label])).toEqual([
      ["2026-01-15", "2026-01-31", "Jan 2026"],
      ["2026-02-01", "2026-02-28", "Feb 2026"],
      ["2026-03-01", "2026-03-31", "Mar 2026"],
      ["2026-04-01", "2026-04-20", "Apr 2026"],
    ]);
  });
});

describe("dashboard links and labels", () => {
  it("omits the default range and keeps venue and event filters", () => {
    expect(dashboardHref({ range: "last30" })).toBe("/dashboard");
    expect(
      dashboardHref({ range: "last7", venueId: "venue-1", eventId: "event-1" }),
    ).toBe("/dashboard?range=last7&venue=venue-1&event=event-1");
    expect(
      dashboardHref({
        range: "custom",
        from: "2026-09-01",
        to: "2026-09-30",
      }),
    ).toBe("/dashboard?range=custom&from=2026-09-01&to=2026-09-30");
  });

  it("formats a span with the shared calendar style", () => {
    expect(formatDashboardSpan("2026-09-01", "2026-09-30")).toBe(
      "1 Sept 2026 – 30 Sept 2026",
    );
    expect(formatDashboardSpan("2026-10-08", "2026-10-08")).toBe("8 Oct 2026");
    expect(formatDashboardSpanCompact("2026-04-06", "2026-07-07")).toBe(
      "6 Apr – 7 Jul 2026",
    );
    expect(formatDashboardSpanCompact("2025-12-28", "2026-01-08")).toBe(
      "28 Dec 2025 – 8 Jan 2026",
    );
  });

  it("rejects an inverted or incomplete custom range", () => {
    const inverted = resolveDashboardQuery(
      { range: "custom", from: "2026-10-10", to: "2026-10-01" },
      today,
    );
    expect(inverted.ok).toBe(false);
    if (inverted.ok) return;
    expect(inverted.error).toBe("The start date must be on or before the end date.");

    const incomplete = resolveDashboardQuery({ from: "2026-10-01" }, today);
    expect(incomplete.ok).toBe(false);
    if (incomplete.ok) return;
    expect(incomplete.error).toBe("Enter a start and end date.");
  });
});
