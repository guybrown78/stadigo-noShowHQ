import { describe, expect, it } from "vitest";
import { FIT_NOTE_STATUSES, SELF_CERTIFICATION_STATUSES } from "@/lib/absence/catalog";
import {
  FIT_NOTE_STATUS_LABELS,
  SELF_CERTIFICATION_STATUS_LABELS,
  fitNoteChanges,
  fitNoteCreateIsNoChange,
  fitNoteDateFieldErrors,
  fitNoteDateModes,
  fitNoteEditIsNoChange,
  fitNoteShowsReceivedDate,
  fitNoteShowsRequestedDate,
  selfCertificationChanges,
  selfCertificationIsNoChange,
} from "@/lib/absence/evidence";
import {
  createFitNoteSchema,
  saveSelfCertificationSchema,
  updateFitNoteSchema,
} from "@/lib/absence/evidence-schema";
import { redactHistoryChangesForPublicFeed } from "@/lib/absence/sensitive";

const today = "2026-09-14";
const key = "idempotency-key-1";

describe("evidence statuses", () => {
  it("uses the approved self-certification and fit note lists", () => {
    expect(SELF_CERTIFICATION_STATUSES).toEqual([
      "NOT_RECORDED",
      "NOT_REQUIRED",
      "AWAITING",
      "RECEIVED",
    ]);
    expect(FIT_NOTE_STATUSES).toEqual([
      "NOT_RECORDED",
      "NOT_REQUIRED",
      "REQUIRED",
      "REQUESTED",
      "RECEIVED",
    ]);
    expect(Object.values(SELF_CERTIFICATION_STATUS_LABELS)).toEqual([
      "Not recorded",
      "Not required",
      "Awaiting",
      "Received",
    ]);
    expect(FIT_NOTE_STATUS_LABELS.REQUESTED).toBe("Requested");
  });
});

describe("fit note dates", () => {
  it("requires a requested date only for Requested, and a received date only for Received", () => {
    expect(fitNoteDateModes("REQUESTED")).toEqual({
      requested: "required",
      received: "forbidden",
    });
    expect(fitNoteDateModes("RECEIVED")).toEqual({
      requested: "optional",
      received: "required",
    });
    expect(fitNoteDateModes("REQUIRED").requested).toBe("forbidden");
    expect(fitNoteDateFieldErrors({
      status: "REQUESTED",
      requestedDate: "",
      receivedDate: "",
      todayIso: today,
    }).requestedDate).toEqual(["Date requested is required"]);
    expect(fitNoteDateFieldErrors({
      status: "RECEIVED",
      requestedDate: "",
      receivedDate: "",
      todayIso: today,
    }).receivedDate).toEqual(["Date received is required"]);
    expect(
      fitNoteDateFieldErrors({
        status: "REQUIRED",
        requestedDate: "2026-09-01",
        receivedDate: "",
        todayIso: today,
      }).requestedDate,
    ).toEqual(["Date requested does not apply to this fit note status"]);
  });

  it("accepts retrospective dates and rejects future dates", () => {
    expect(
      fitNoteDateFieldErrors({
        status: "REQUESTED",
        requestedDate: "2026-09-01",
        receivedDate: "",
        todayIso: today,
      }),
    ).toEqual({});
    expect(
      fitNoteDateFieldErrors({
        status: "RECEIVED",
        requestedDate: "2026-09-01",
        receivedDate: "2026-09-14",
        todayIso: today,
      }),
    ).toEqual({});
    expect(
      fitNoteDateFieldErrors({
        status: "REQUESTED",
        requestedDate: "2026-09-15",
        receivedDate: "",
        todayIso: today,
      }).requestedDate,
    ).toEqual(["Enter a date that is not in the future."]);
  });

  it("shows requested and received dates only when they apply", () => {
    expect(fitNoteShowsRequestedDate("REQUESTED", null)).toBe(true);
    expect(fitNoteShowsRequestedDate("RECEIVED", "2026-09-01")).toBe(true);
    expect(fitNoteShowsRequestedDate("RECEIVED", null)).toBe(false);
    expect(fitNoteShowsRequestedDate("REQUIRED", "2026-09-01")).toBe(false);
    expect(fitNoteShowsReceivedDate("RECEIVED")).toBe(true);
    expect(fitNoteShowsReceivedDate("REQUESTED")).toBe(false);
  });
});

describe("evidence change rules", () => {
  it("treats a first Not recorded self-certification as no change", () => {
    expect(selfCertificationIsNoChange(null, "NOT_RECORDED")).toBe(true);
    expect(selfCertificationIsNoChange(null, "AWAITING")).toBe(false);
    expect(selfCertificationIsNoChange("AWAITING", "AWAITING")).toBe(true);
    expect(selfCertificationChanges(null, "AWAITING")).toEqual([
      {
        field: "selfCertificationStatus",
        previous: null,
        next: "AWAITING",
      },
    ]);
  });

  it("rejects an empty fit note create and an unchanged edit", () => {
    expect(
      fitNoteCreateIsNoChange({
        status: "NOT_RECORDED",
        requestedDate: null,
        receivedDate: null,
        note: null,
      }),
    ).toBe(true);
    expect(
      fitNoteCreateIsNoChange({
        status: "NOT_RECORDED",
        requestedDate: null,
        receivedDate: null,
        note: "Chased by phone",
      }),
    ).toBe(false);
    const snapshot = {
      status: "REQUIRED" as const,
      requestedDate: null,
      receivedDate: null,
      note: null,
    };
    expect(fitNoteEditIsNoChange(snapshot, snapshot)).toBe(true);
  });

  it("summarises one fit note save and redacts the note for a public feed", () => {
    const changes = fitNoteChanges({
      fitNoteId: "fit-note-1",
      previous: null,
      next: {
        status: "REQUESTED",
        requestedDate: "2026-09-01",
        receivedDate: null,
        note: "Secret chase note",
      },
    });
    expect(changes.map((change) => change.field)).toEqual([
      "fitNoteId",
      "fitNoteStatus",
      "fitNoteRequestedDate",
      "fitNoteNote",
    ]);
    const redacted = redactHistoryChangesForPublicFeed(changes);
    expect(redacted.find((change) => change.field === "fitNoteNote")).toEqual({
      field: "fitNoteNote",
      previous: "Fit note note changed",
      next: "Fit note note changed",
    });
    expect(JSON.stringify(redacted)).not.toContain("Secret chase note");
  });
});

describe("evidence schemas", () => {
  it("requires a correction reason only when self-certification was already saved", () => {
    const created = saveSelfCertificationSchema().safeParse({
      absenceId: "absence-1",
      status: "AWAITING",
      correctionReason: "",
      expectedUpdatedAt: "",
      idempotencyKey: key,
    });
    expect(created.success).toBe(true);
    const corrected = saveSelfCertificationSchema().safeParse({
      absenceId: "absence-1",
      status: "RECEIVED",
      correctionReason: "x",
      expectedUpdatedAt: "2026-09-14T12:00:00.000Z",
      idempotencyKey: key,
    });
    expect(corrected.success).toBe(false);
  });

  it("rejects a future requested date in the shared fit note schema", () => {
    const parsed = createFitNoteSchema(today).safeParse({
      absenceId: "absence-1",
      status: "REQUESTED",
      requestedDate: "2026-09-15",
      receivedDate: "",
      note: "",
      idempotencyKey: key,
    });
    expect(parsed.success).toBe(false);
  });

  it("requires a correction reason when editing a fit note", () => {
    const parsed = updateFitNoteSchema(today).safeParse({
      fitNoteId: "fit-1",
      status: "RECEIVED",
      requestedDate: "2026-09-01",
      receivedDate: "2026-09-10",
      note: "",
      correctionReason: "",
      expectedUpdatedAt: "2026-09-14T12:00:00.000Z",
      idempotencyKey: key,
    });
    expect(parsed.success).toBe(false);
  });
});
