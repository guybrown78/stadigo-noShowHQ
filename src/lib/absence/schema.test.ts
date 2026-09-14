import { describe, expect, it } from "vitest";
import {
  parseArchiveAwolFormData,
  parseArchiveCancellationFormData,
  parseAwolFormData,
  parseCancellationFormData,
  parseCorrectAwolFormData,
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
import { CREATABLE_ABSENCE_TYPES } from "@/lib/absence/catalog";
import { noticeWarningFlags, formatInternalNotes } from "@/lib/absence/display";

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

  it("allow-lists ledger views and defaults AWOL sort to event date", () => {
    const awol = parseLedgerListQuery({ view: "awol" });
    expect(awol.view).toBe("awol");
    expect(awol.sort).toBe("eventDate");
    expect(awol.page).toBe(1);

    const unknown = parseLedgerListQuery({ view: "sickness" });
    expect(unknown.view).toBe("cancellations");
    expect(unknown.sort).toBe("reported");

    const noticeSort = parseLedgerListQuery({ view: "awol", sort: "notice" });
    expect(noticeSort.sort).toBe("eventDate");
  });
});

describe("absence type cards", () => {
  it("enables Cancellation and AWOL and keeps Sickness coming soon", () => {
    expect(CREATABLE_ABSENCE_TYPES).toEqual(["CANCELLATION", "AWOL"]);
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

  it("emits the AWOL view and keeps Cancellation URLs stable", () => {
    expect(ledgerListHref(defaultLedgerListQuery())).toBe("/ledger");
    expect(ledgerListHref(defaultLedgerListQuery("awol"))).toBe(
      "/ledger?view=awol",
    );
  });
});

describe("formatInternalNotes", () => {
  it("returns the current trimmed notes or the empty fallback", () => {
    expect(formatInternalNotes("Line one\nLine two")).toBe("Line one\nLine two");
    expect(formatInternalNotes("  kept  ")).toBe("kept");
    expect(formatInternalNotes(null)).toBe("No internal notes recorded");
    expect(formatInternalNotes(undefined)).toBe("No internal notes recorded");
    expect(formatInternalNotes("")).toBe("No internal notes recorded");
    expect(formatInternalNotes("   ")).toBe("No internal notes recorded");
    expect(formatInternalNotes("\n\t")).toBe("No internal notes recorded");
    expect(formatInternalNotes("<script>alert(1)</script>")).toBe(
      "<script>alert(1)</script>",
    );
    expect(formatInternalNotes("x".repeat(2000))).toHaveLength(2000);
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

describe("awolInputSchema", () => {
  function awolData(overrides: Record<string, string> = {}) {
    const data = new FormData();
    const values = {
      type: "AWOL",
      staffId: "staff_1",
      eventId: "event_1",
      reportedDate: "2026-09-12",
      notes: "",
      idempotencyKey: "idem-key-1234",
      eventDate: "2026-09-10",
      ...overrides,
    };
    for (const [key, value] of Object.entries(values)) {
      data.set(key, value);
    }
    return data;
  }

  it("accepts a valid AWOL with blank notes", () => {
    const parsed = parseAwolFormData(awolData());
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.notes).toBeNull();
    expect(parsed.data.type).toBe("AWOL");
  });

  it("rejects Cancellation-only fields as the AWOL type", () => {
    const parsed = parseAwolFormData(awolData({ type: "CANCELLATION" }));
    expect(parsed.success).toBe(false);
  });

  it("rejects Date recorded before the Event date", () => {
    const parsed = parseAwolFormData(
      awolData({ reportedDate: "2026-09-01", eventDate: "2026-09-10" }),
    );
    expect(parsed.success).toBe(false);
  });

  it("requires a correction reason and expectedUpdatedAt", () => {
    expect(parseCorrectAwolFormData(awolData()).success).toBe(false);
    const data = awolData();
    data.set("correctionReason", "Wrong event");
    data.set("expectedUpdatedAt", new Date().toISOString());
    expect(parseCorrectAwolFormData(data).success).toBe(true);
  });

  it("requires archive confirmation, reason and expectedUpdatedAt", () => {
    expect(parseArchiveAwolFormData(new FormData()).success).toBe(false);
    const data = new FormData();
    data.set("archiveReason", "Logged against the wrong person");
    data.set("confirmArchive", "on");
    data.set("expectedUpdatedAt", new Date().toISOString());
    expect(parseArchiveAwolFormData(data).success).toBe(true);
  });

  it("rejects notes over the maximum length", () => {
    const parsed = parseAwolFormData(awolData({ notes: "x".repeat(2001) }));
    expect(parsed.success).toBe(false);
  });

  it("does not accept Cancellation hidden fields on an AWOL payload", () => {
    const data = awolData();
    data.set("reason", "Called in");
    data.set("reportedTime", "09:00");
    data.set("retrospectiveConfirmed", "on");
    const parsed = parseAwolFormData(data);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect("reason" in parsed.data).toBe(false);
    expect("reportedTime" in parsed.data).toBe(false);
    expect(parsed.data.notes).toBeNull();
  });
});
