import { describe, expect, it } from "vitest";
import {
  parseArchiveCancellationFormData,
  parseCancellationFormData,
  parseCorrectCancellationFormData,
} from "@/lib/absence/schema";

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
