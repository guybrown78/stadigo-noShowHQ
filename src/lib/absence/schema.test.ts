import { describe, expect, it } from "vitest";
import {
  parseArchiveAwolFormData,
  parseArchiveCancellationFormData,
  parseArchiveSicknessFormData,
  parseAwolFormData,
  parseCancellationFormData,
  parseCorrectAwolFormData,
  parseCorrectCancellationFormData,
  parseCorrectSicknessFormData,
  parseSicknessFormData,
  parseLedgerListQuery,
  isLedgerDateRangeInvalid,
  isLedgerFirstDayRangeInvalid,
  ledgerHasActiveFilters,
  defaultLedgerListQuery,
} from "@/lib/absence/schema";
import {
  absenceCancelHref,
  ledgerListHref,
  ledgerViewHref,
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
    expect(parsed.view).toBe("all");
    expect(parsed.sort).toBe("reported");
    expect(parsed.direction).toBe("desc");
    expect(parsed.page).toBe(1);
    expect(parsed.venue).toBe("");
    expect(parsed.includeArchived).toBe(false);
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

  it("allow-lists ledger views and defaults Sickness sort to first working day", () => {
    const all = parseLedgerListQuery({});
    expect(all.view).toBe("all");
    expect(all.sort).toBe("reported");

    const cancellations = parseLedgerListQuery({ view: "cancellations" });
    expect(cancellations.view).toBe("cancellations");
    expect(cancellations.sort).toBe("reported");

    const awol = parseLedgerListQuery({ view: "awol" });
    expect(awol.view).toBe("awol");
    expect(awol.sort).toBe("eventDate");
    expect(awol.page).toBe(1);

    const sickness = parseLedgerListQuery({ view: "sickness" });
    expect(sickness.view).toBe("sickness");
    expect(sickness.sort).toBe("firstDay");
    expect(sickness.includeArchived).toBe(false);
    expect(sickness.page).toBe(1);

    const unknown = parseLedgerListQuery({ view: "payroll" });
    expect(unknown.view).toBe("all");
    expect(unknown.sort).toBe("reported");

    const noticeSort = parseLedgerListQuery({ view: "awol", sort: "notice" });
    expect(noticeSort.sort).toBe("eventDate");

    const invalidAllSort = parseLedgerListQuery({
      view: "all",
      sort: "notice",
    });
    expect(invalidAllSort.sort).toBe("reported");

    const invalidSicknessSort = parseLedgerListQuery({
      view: "sickness",
      sort: "notice",
    });
    expect(invalidSicknessSort.sort).toBe("firstDay");

    const includeArchived = parseLedgerListQuery({
      view: "all",
      includeArchived: "1",
    });
    expect(includeArchived.includeArchived).toBe(true);
    expect(ledgerHasActiveFilters(includeArchived)).toBe(true);

    const ignoredArchived = parseLedgerListQuery({
      view: "sickness",
      includeArchived: "true",
    });
    expect(ignoredArchived.includeArchived).toBe(false);

    const invertedFirstDay = parseLedgerListQuery({
      view: "sickness",
      firstDayFrom: "2026-09-20",
      firstDayTo: "2026-09-01",
    });
    expect(isLedgerFirstDayRangeInvalid(invertedFirstDay)).toBe(true);
    expect(invertedFirstDay.affectedFrom).toBe("2026-09-20");
    expect(invertedFirstDay.affectedTo).toBe("2026-09-01");
    expect(ledgerHasActiveFilters(invertedFirstDay)).toBe(false);

    const affectedAlias = parseLedgerListQuery({
      view: "awol",
      eventFrom: "2026-08-01",
      eventTo: "2026-08-31",
    });
    expect(affectedAlias.affectedFrom).toBe("2026-08-01");
    expect(affectedAlias.affectedTo).toBe("2026-08-31");
    expect(ledgerHasActiveFilters(affectedAlias)).toBe(true);
  });
});

describe("absence type cards", () => {
  it("enables Cancellation, AWOL and Sickness", () => {
    expect(CREATABLE_ABSENCE_TYPES).toEqual(["CANCELLATION", "AWOL", "SICKNESS"]);
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
        affectedFrom: "2026-09-02",
        affectedTo: "2026-09-20",
        sort: "affected",
        direction: "asc",
        page: 2,
      }),
    ).toBe(
      "/ledger?q=Patel&venue=venue_1&eventType=type_1&reportedFrom=2026-09-01&reportedTo=2026-09-30&affectedFrom=2026-09-02&affectedTo=2026-09-20&sort=affected&direction=asc&page=2",
    );
  });

  it("emits focused views and maps affected-date aliases", () => {
    expect(ledgerListHref(defaultLedgerListQuery())).toBe("/ledger");
    expect(ledgerListHref(defaultLedgerListQuery("cancellations"))).toBe(
      "/ledger?view=cancellations",
    );
    expect(ledgerListHref(defaultLedgerListQuery("awol"))).toBe(
      "/ledger?view=awol",
    );
    expect(ledgerListHref(defaultLedgerListQuery("sickness"))).toBe(
      "/ledger?view=sickness",
    );
    expect(
      ledgerListHref({
        ...defaultLedgerListQuery("sickness"),
        q: "Jamie",
        firstDayFrom: "2026-09-01",
        firstDayTo: "2026-09-30",
        includeArchived: true,
        sort: "staff",
        direction: "asc",
        page: 2,
      }),
    ).toBe(
      "/ledger?view=sickness&q=Jamie&affectedFrom=2026-09-01&affectedTo=2026-09-30&includeArchived=1&sort=staff&direction=asc&page=2",
    );
  });

  it("preserves compatible filters when switching views", () => {
    const current = {
      ...defaultLedgerListQuery("all"),
      q: "Patel",
      venue: "venue_1",
      includeArchived: true,
      sort: "notice" as const,
      direction: "asc" as const,
      page: 3,
    };
    expect(ledgerViewHref(current, "sickness")).toBe(
      "/ledger?view=sickness&q=Patel&includeArchived=1",
    );
    expect(ledgerViewHref(current, "cancellations")).toBe(
      "/ledger?view=cancellations&q=Patel&venue=venue_1&includeArchived=1&sort=notice&direction=asc",
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

describe("sicknessInputSchema", () => {
  function sicknessData(overrides: Record<string, string> = {}) {
    const data = new FormData();
    const values = {
      type: "SICKNESS",
      staffId: "staff_1",
      reportedDate: "2026-09-14",
      firstWorkingDaySick: "2026-09-14",
      sicknessStartedDate: "",
      issueSummary: "",
      idempotencyKey: "idem-key-1234",
      todayIso: "2026-09-14",
      ...overrides,
    };
    for (const [key, value] of Object.entries(values)) {
      data.set(key, value);
    }
    return data;
  }

  it("accepts required fields only and normalises a blank issue summary", () => {
    const parsed = parseSicknessFormData(sicknessData());
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.issueSummary).toBeNull();
    expect(parsed.data.sicknessStartedDate).toBeNull();
    expect(parsed.data.type).toBe("SICKNESS");
  });

  it("rejects an Event ID rather than stripping it", () => {
    const parsed = parseSicknessFormData(
      sicknessData({ eventId: "event_1" }),
    );
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(
      parsed.error.issues.some((issue) => issue.path[0] === "eventId"),
    ).toBe(true);
  });

  it("rejects Cancellation and AWOL fields", () => {
    const parsed = parseSicknessFormData(
      sicknessData({ reason: "Called in", reportedTime: "09:00" }),
    );
    expect(parsed.success).toBe(false);
  });

  it("requires advance confirmation for a future first working day", () => {
    const parsed = parseSicknessFormData(
      sicknessData({ firstWorkingDaySick: "2026-09-15" }),
    );
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(
      parsed.error.issues.some(
        (issue) => issue.path[0] === "futureFirstWorkingDayConfirmed",
      ),
    ).toBe(true);
  });

  it("accepts a confirmed future first working day at the 31-day boundary", () => {
    const data = sicknessData({ firstWorkingDaySick: "2026-10-15" });
    data.set("futureFirstWorkingDayConfirmed", "on");
    const parsed = parseSicknessFormData(data);
    expect(parsed.success).toBe(true);
  });

  it("rejects a first working day more than 31 days after the reported date", () => {
    const data = sicknessData({ firstWorkingDaySick: "2026-10-16" });
    data.set("futureFirstWorkingDayConfirmed", "on");
    const parsed = parseSicknessFormData(data);
    expect(parsed.success).toBe(false);
  });

  it("rejects sickness started after the first working day", () => {
    const parsed = parseSicknessFormData(
      sicknessData({
        firstWorkingDaySick: "2026-09-14",
        sicknessStartedDate: "2026-09-15",
      }),
    );
    expect(parsed.success).toBe(false);
  });

  it("rejects a future reported date", () => {
    const parsed = parseSicknessFormData(
      sicknessData({ reportedDate: "2026-09-15" }),
    );
    expect(parsed.success).toBe(false);
  });

  it("normalises whitespace-only issue summary and keeps inner line breaks", () => {
    const blank = parseSicknessFormData(sicknessData({ issueSummary: "  \n  " }));
    expect(blank.success).toBe(true);
    if (blank.success) {
      expect(blank.data.issueSummary).toBeNull();
    }
    const lines = parseSicknessFormData(
      sicknessData({ issueSummary: "Unable to work\nNo cover needed" }),
    );
    expect(lines.success).toBe(true);
    if (lines.success) {
      expect(lines.data.issueSummary).toBe("Unable to work\nNo cover needed");
    }
  });

  it("requires a correction reason and expectedUpdatedAt", () => {
    expect(parseCorrectSicknessFormData(sicknessData()).success).toBe(false);
    const data = sicknessData();
    data.set("correctionReason", "Wrong first day");
    data.set("expectedUpdatedAt", new Date().toISOString());
    expect(parseCorrectSicknessFormData(data).success).toBe(true);
  });

  it("requires archive confirmation, reason and expectedUpdatedAt", () => {
    expect(parseArchiveSicknessFormData(new FormData()).success).toBe(false);
    const data = new FormData();
    data.set("archiveReason", "Logged against the wrong person");
    data.set("confirmArchive", "on");
    data.set("expectedUpdatedAt", new Date().toISOString());
    expect(parseArchiveSicknessFormData(data).success).toBe(true);
  });
});
