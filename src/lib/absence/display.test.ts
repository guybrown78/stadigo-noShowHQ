import { describe, expect, it } from "vitest";
import {
  formatLedgerResultsSummary,
  ledgerSearchPlaceholder,
} from "@/lib/absence/display";

const emptyTypeCounts = {
  CANCELLATION: 0,
  AWOL: 0,
  SICKNESS: 0,
};

describe("ledgerSearchPlaceholder", () => {
  it("guides Sickness search without mentioning Event", () => {
    expect(ledgerSearchPlaceholder("sickness")).toBe("Staff name or Staff ID");
  });

  it("guides event-linked views to Staff and Event identity", () => {
    expect(ledgerSearchPlaceholder("all")).toBe(
      "Staff name, Staff ID, Event name or reference",
    );
    expect(ledgerSearchPlaceholder("cancellations")).toBe(
      "Staff name, Staff ID, Event name or reference",
    );
    expect(ledgerSearchPlaceholder("awol")).toBe(
      "Staff name, Staff ID, Event name or reference",
    );
  });
});

describe("formatLedgerResultsSummary", () => {
  it("uses compact active and type totals when All has no filters", () => {
    expect(
      formatLedgerResultsSummary({
        view: "all",
        total: 5,
        activeTotal: 5,
        matchingTypeCounts: {
          CANCELLATION: 2,
          AWOL: 2,
          SICKNESS: 1,
        },
        activeTypeCounts: {
          CANCELLATION: 2,
          AWOL: 2,
          SICKNESS: 1,
        },
        hasFilters: false,
        includeArchived: false,
        page: 1,
        pageCount: 1,
      }),
    ).toEqual([
      "5 active absences · Cancellations 2, AWOL 2, Sickness 1",
    ]);
  });

  it("separates matching types from the overall active total when All is filtered", () => {
    expect(
      formatLedgerResultsSummary({
        view: "all",
        total: 3,
        activeTotal: 5,
        matchingTypeCounts: {
          CANCELLATION: 1,
          AWOL: 2,
          SICKNESS: 0,
        },
        activeTypeCounts: {
          CANCELLATION: 2,
          AWOL: 2,
          SICKNESS: 1,
        },
        hasFilters: true,
        includeArchived: false,
        page: 1,
        pageCount: 1,
      }),
    ).toEqual([
      "Showing 3 matching absences",
      "Matching types: Cancellations 1, AWOL 2, Sickness 0",
      "Overall active total: 5",
    ]);
  });

  it("says when Show archived is included in the matching count", () => {
    expect(
      formatLedgerResultsSummary({
        view: "all",
        total: 15,
        activeTotal: 5,
        matchingTypeCounts: {
          CANCELLATION: 6,
          AWOL: 5,
          SICKNESS: 4,
        },
        activeTypeCounts: {
          CANCELLATION: 2,
          AWOL: 2,
          SICKNESS: 1,
        },
        hasFilters: true,
        includeArchived: true,
        page: 1,
        pageCount: 1,
      }),
    ).toEqual([
      "Showing 15 matching absences, including archived",
      "Matching types: Cancellations 6, AWOL 5, Sickness 4",
      "Overall active total: 5",
    ]);
  });

  it("omits matching types on focused views", () => {
    expect(
      formatLedgerResultsSummary({
        view: "sickness",
        total: 1,
        activeTotal: 2,
        matchingTypeCounts: {
          ...emptyTypeCounts,
          SICKNESS: 1,
        },
        activeTypeCounts: {
          CANCELLATION: 2,
          AWOL: 2,
          SICKNESS: 2,
        },
        hasFilters: true,
        includeArchived: false,
        page: 1,
        pageCount: 1,
      }),
    ).toEqual([
      "Showing 1 matching Sickness report",
      "Overall active total: 2",
    ]);
  });
});
