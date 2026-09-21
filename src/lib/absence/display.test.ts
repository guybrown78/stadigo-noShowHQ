import { describe, expect, it } from "vitest";
import {
  formatLedgerResultsSummary,
  ledgerSearchPlaceholder,
  ledgerViewDetailsLabel,
  absenceAllowsCorrectAndArchive,
  absenceArchiveActionLabel,
  absenceCorrectActionLabel,
  absenceDetailBodyLabels,
  absenceDetailShowsEvent,
  absenceDetailShowsVenue,
  absenceEpisodeUpdateActionLabel,
  ABSENCE_DETAIL_LABEL,
  formatSicknessLedgerEpisodeContext,
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

describe("ledgerViewDetailsLabel", () => {
  it("names the Ledger View action by absence type", () => {
    expect(ledgerViewDetailsLabel("CANCELLATION")).toBe(
      "View Cancellation details",
    );
    expect(ledgerViewDetailsLabel("AWOL")).toBe("View AWOL details");
    expect(ledgerViewDetailsLabel("SICKNESS")).toBe("View Sickness details");
  });
});

describe("absence detail drawer contract", () => {
  it("exposes Correct and Archive only for Active records, with type-specific labels", () => {
    expect(absenceAllowsCorrectAndArchive("ACTIVE")).toBe(true);
    expect(absenceAllowsCorrectAndArchive("ARCHIVED")).toBe(false);

    expect(absenceCorrectActionLabel("CANCELLATION")).toBe(
      "Correct cancellation",
    );
    expect(absenceArchiveActionLabel("CANCELLATION")).toBe(
      "Archive cancellation",
    );
    expect(absenceCorrectActionLabel("AWOL")).toBe("Correct AWOL");
    expect(absenceArchiveActionLabel("AWOL")).toBe("Archive AWOL");
    expect(absenceCorrectActionLabel("SICKNESS")).toBe(
      "Correct sickness report",
    );
    expect(absenceArchiveActionLabel("SICKNESS")).toBe(
      "Archive sickness report",
    );
    expect(absenceEpisodeUpdateActionLabel()).toBe("Update sickness episode");
  });

  it("keeps type-specific bodies and does not invent Event or Venue for Sickness", () => {
    expect(absenceDetailShowsEvent("CANCELLATION")).toBe(true);
    expect(absenceDetailShowsEvent("AWOL")).toBe(true);
    expect(absenceDetailShowsEvent("SICKNESS")).toBe(false);
    expect(absenceDetailShowsVenue("AWOL")).toBe(true);
    expect(absenceDetailShowsVenue("CANCELLATION")).toBe(true);
    expect(absenceDetailShowsVenue("SICKNESS")).toBe(false);

    expect(absenceDetailBodyLabels("CANCELLATION")).toEqual([
      ABSENCE_DETAIL_LABEL.staff,
      ABSENCE_DETAIL_LABEL.event,
      ABSENCE_DETAIL_LABEL.venue,
      ABSENCE_DETAIL_LABEL.reported,
      ABSENCE_DETAIL_LABEL.noticeGiven,
      ABSENCE_DETAIL_LABEL.reason,
      ABSENCE_DETAIL_LABEL.internalNotes,
      ABSENCE_DETAIL_LABEL.created,
      ABSENCE_DETAIL_LABEL.lastUpdated,
    ]);
    expect(absenceDetailBodyLabels("AWOL")).toContain(
      ABSENCE_DETAIL_LABEL.internalNotes,
    );
    expect(absenceDetailBodyLabels("AWOL")).toContain(
      ABSENCE_DETAIL_LABEL.eventDetails,
    );
    expect(absenceDetailBodyLabels("SICKNESS")).toEqual([
      ABSENCE_DETAIL_LABEL.staff,
      ABSENCE_DETAIL_LABEL.recordStatus,
      ABSENCE_DETAIL_LABEL.episodeStatus,
      ABSENCE_DETAIL_LABEL.dateSicknessReported,
      ABSENCE_DETAIL_LABEL.firstDaySick,
      ABSENCE_DETAIL_LABEL.sicknessStarted,
      ABSENCE_DETAIL_LABEL.sicknessEnded,
      ABSENCE_DETAIL_LABEL.calendarDaySpan,
      ABSENCE_DETAIL_LABEL.issueSummary,
      ABSENCE_DETAIL_LABEL.created,
    ]);
    expect(absenceDetailBodyLabels("SICKNESS")).not.toContain(
      ABSENCE_DETAIL_LABEL.event,
    );
    expect(absenceDetailBodyLabels("SICKNESS")).not.toContain(
      ABSENCE_DETAIL_LABEL.eventDetails,
    );
    expect(absenceDetailBodyLabels("SICKNESS")).not.toContain(
      ABSENCE_DETAIL_LABEL.venue,
    );
    expect(absenceDetailBodyLabels("SICKNESS")).not.toEqual(
      expect.arrayContaining([
        "Fit note",
        "Self-certification",
        "Return to work",
        "Duration",
        "Documents",
      ]),
    );
  });
});

describe("formatSicknessLedgerEpisodeContext", () => {
  it("shows episode status and the end date for ended records", () => {
    expect(
      formatSicknessLedgerEpisodeContext({
        episodeState: "NOT_CONFIRMED",
        sicknessEndedDate: null,
      }),
    ).toBe("Episode status not confirmed");
    expect(
      formatSicknessLedgerEpisodeContext({
        episodeState: "ONGOING",
        sicknessEndedDate: null,
      }),
    ).toBe("Ongoing");
    expect(
      formatSicknessLedgerEpisodeContext({
        episodeState: "ENDED",
        sicknessEndedDate: new Date("2026-09-17T00:00:00.000Z"),
      }),
    ).toBe("Ended · 17 Sept 2026");
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
