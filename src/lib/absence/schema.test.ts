import { describe, expect, it } from "vitest";
import {
  parseArchiveCancellationFormData,
  parseCancellationFormData,
  parseCorrectCancellationFormData,
  parseLedgerListQuery,
  isLedgerDateRangeInvalid,
  ledgerHasActiveFilters,
  defaultLedgerListQuery,
} from "@/lib/absence/schema";
import {
  absenceCancelHref,
  ledgerListHref,
  parseAbsenceReturnOrigin,
} from "@/lib/absence/url";
import { noticeWarningFlags } from "@/lib/absence/display";

function formData(overrides: Record<string, string> = {}) {
  const data = new FormData();
  const values = {
    type: "CANCELLATION",
    staffId: "staff_1",
    eventId: "event_1",
    reportedDate: "2026-09-10",
    reportedTime: "",
    reason: "Family emergency",
    notes: "",
    eventDate: "2026-09-12",
    eventStartTime: "14:00",
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }
  return data;
}

describe("cancellationInputSchema", () => {
  it("accepts a valid cancellation with optional time and notes", () => {
    const parsed = parseCancellationFormData(formData());
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.reportedTime).toBeNull();
    expect(parsed.data.notes).toBeNull();
    expect(parsed.data.reason).toBe("Family emergency");
  });

  it("rejects a reason that is too short", () => {
    const parsed = parseCancellationFormData(formData({ reason: "A" }));
    expect(parsed.success).toBe(false);
  });

  it("rejects types other than Cancellation", () => {
    const parsed = parseCancellationFormData(formData({ type: "AWOL" }));
    expect(parsed.success).toBe(false);
  });

  it("requires retrospective confirmation after the event date", () => {
    const parsed = parseCancellationFormData(
      formData({ reportedDate: "2026-09-13" }),
    );
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues.some((issue) => issue.path[0] === "retrospectiveConfirmed")).toBe(
      true,
    );
  });

  it("accepts a confirmed retrospective record", () => {
    const data = formData({ reportedDate: "2026-09-13" });
    data.set("retrospectiveConfirmed", "on");
    const parsed = parseCancellationFormData(data);
    expect(parsed.success).toBe(true);
  });

  it("does not require confirmation for a same-day calendar report", () => {
    const parsed = parseCancellationFormData(
      formData({
        reportedDate: "2026-09-12",
        eventStartTime: "",
      }),
    );
    expect(parsed.success).toBe(true);
  });

  it("requires a correction reason", () => {
    const parsed = parseCorrectCancellationFormData(formData());
    expect(parsed.success).toBe(false);
  });

  it("accepts a valid correction", () => {
    const data = formData();
    data.set("correctionReason", "Wrong event selected");
    const parsed = parseCorrectCancellationFormData(data);
    expect(parsed.success).toBe(true);
  });

  it("requires archive confirmation and reason", () => {
    const empty = new FormData();
    expect(parseArchiveCancellationFormData(empty).success).toBe(false);

    const data = new FormData();
    data.set("archiveReason", "Entered against the wrong person");
    data.set("confirmArchive", "on");
    expect(parseArchiveCancellationFormData(data).success).toBe(true);
  });
});

describe("ledgerListQuerySchema", () => {
  it("applies defaults and trims search", () => {
    const parsed = parseLedgerListQuery({ q: "  Alex  " });
    expect(parsed.q).toBe("Alex");
    expect(parsed.sort).toBe("reported");
    expect(parsed.direction).toBe("desc");
    expect(parsed.page).toBe(1);
    expect(parsed.venue).toBe("");
  });

  it("falls back safely for invalid sort, direction, page and dates", () => {
    const parsed = parseLedgerListQuery({
      q: "steward",
      sort: "payPeriod",
      direction: "sideways",
      page: "0",
      reportedFrom: "not-a-date",
      reportedTo: "2026-13-40",
    });
    expect(parsed.q).toBe("steward");
    expect(parsed.sort).toBe("reported");
    expect(parsed.direction).toBe("desc");
    expect(parsed.page).toBe(1);
    expect(parsed.reportedFrom).toBe("");
    expect(parsed.reportedTo).toBe("");
  });

  it("keeps an inverted date range so the page can show an error", () => {
    const parsed = parseLedgerListQuery({
      reportedFrom: "2026-09-20",
      reportedTo: "2026-09-01",
    });
    expect(parsed.reportedFrom).toBe("2026-09-20");
    expect(parsed.reportedTo).toBe("2026-09-01");
    expect(isLedgerDateRangeInvalid(parsed)).toBe(true);
    expect(ledgerHasActiveFilters(parsed)).toBe(false);
  });

  it("treats a valid date range as an active filter", () => {
    const parsed = parseLedgerListQuery({
      reportedFrom: "2026-09-01",
      reportedTo: "2026-09-20",
    });
    expect(ledgerHasActiveFilters(parsed)).toBe(true);
  });

  it("accepts unknown view values without changing list defaults", () => {
    const parsed = parseLedgerListQuery({ view: "awol" });
    expect(parsed.view).toBe("awol");
    expect(parsed.sort).toBe("reported");
    expect(parsed.page).toBe(1);
  });
});

describe("absenceCancelHref", () => {
  it("returns the Staff profile only for a validated staff origin", () => {
    expect(parseAbsenceReturnOrigin("staff")).toBe("staff");
    expect(parseAbsenceReturnOrigin("/staff/abc")).toBeNull();
    expect(parseAbsenceReturnOrigin("https://example.com")).toBeNull();
    expect(
      absenceCancelHref({ origin: "staff", staffId: "staff_1" }),
    ).toBe("/staff/staff_1");
    expect(absenceCancelHref({ origin: "staff", staffId: null })).toBe(
      "/dashboard",
    );
    expect(absenceCancelHref({ origin: null, staffId: "staff_1" })).toBe(
      "/dashboard",
    );
  });
});

describe("ledgerListHref", () => {
  it("omits default values from the URL", () => {
    expect(ledgerListHref(defaultLedgerListQuery())).toBe("/ledger");
  });

  it("composes search, filters, sort and page", () => {
    expect(
      ledgerListHref({
        ...defaultLedgerListQuery(),
        q: "Patel",
        venue: "venue_1",
        eventType: "type_1",
        reportedFrom: "2026-09-01",
        reportedTo: "2026-09-30",
        sort: "eventDate",
        direction: "asc",
        page: 2,
      }),
    ).toBe(
      "/ledger?q=Patel&venue=venue_1&eventType=type_1&reportedFrom=2026-09-01&reportedTo=2026-09-30&sort=eventDate&direction=asc&page=2",
    );
  });
});

describe("noticeWarningFlags", () => {
  it("labels short notice and retrospective states from stored values", () => {
    expect(
      noticeWarningFlags({
        isShortNotice: true,
        noticeCalendarDays: 0,
        noticeMinutes: null,
      }),
    ).toEqual({ shortNotice: true, retrospective: false });
    expect(
      noticeWarningFlags({
        isShortNotice: true,
        noticeCalendarDays: -1,
        noticeMinutes: -30,
      }),
    ).toEqual({ shortNotice: true, retrospective: true });
    expect(
      noticeWarningFlags({
        isShortNotice: false,
        noticeCalendarDays: 2,
        noticeMinutes: 3000,
      }),
    ).toEqual({ shortNotice: false, retrospective: false });
  });
});
