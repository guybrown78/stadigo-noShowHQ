import { describe, expect, it } from "vitest";
import {
  FOLLOW_UP_DETAILS_CHANGED_MARKER,
  redactHistoryChangesForPublicFeed,
  redactHistoryReasonForPublicFeed,
} from "@/lib/absence/sensitive";
import { todayIsoInTimeZone } from "@/lib/absence/timezone";
import {
  compareOpenFollowUps,
  completionNotesReuseDetails,
  followUpDueState,
  followUpEditIsNoChange,
  followUpMutationsAllowed,
  followUpStateFieldsValid,
  followUpUpdateChanges,
  sortFollowUpsForDetail,
  type FollowUpOrderFields,
} from "@/lib/absence/follow-up";
import { followUpQueueHref } from "@/lib/absence/follow-up-url";
import {
  parseCompleteFollowUpFormData,
  parseCreateFollowUpFormData,
} from "@/lib/absence/follow-up-schema";

function item(
  overrides: Partial<FollowUpOrderFields> & Pick<FollowUpOrderFields, "id">,
): FollowUpOrderFields {
  return {
    state: "OPEN",
    dueDateIso: "2026-06-02",
    createdAt: new Date("2026-06-01T10:00:00.000Z"),
    completedAt: null,
    cancelledAt: null,
    ...overrides,
  };
}

describe("follow-up due state", () => {
  it("derives overdue, due today and upcoming from the tenant date", () => {
    expect(followUpDueState("2026-06-01", "2026-06-02", "OPEN")).toBe("overdue");
    expect(followUpDueState("2026-06-02", "2026-06-02", "OPEN")).toBe("dueToday");
    expect(followUpDueState("2026-06-03", "2026-06-02", "OPEN")).toBe("upcoming");
    expect(followUpDueState("2026-06-01", "2026-06-02", "COMPLETED")).toBeNull();
    expect(followUpDueState("2026-06-01", "2026-06-02", "CANCELLED")).toBeNull();
  });

  it("keeps the London calendar date across BST and GMT midnights", () => {
    expect(
      todayIsoInTimeZone("Europe/London", new Date("2026-06-01T22:30:00.000Z")),
    ).toBe("2026-06-01");
    expect(
      todayIsoInTimeZone("Europe/London", new Date("2026-06-01T23:30:00.000Z")),
    ).toBe("2026-06-02");
    expect(
      todayIsoInTimeZone("Europe/London", new Date("2026-01-15T23:30:00.000Z")),
    ).toBe("2026-01-15");
    expect(
      todayIsoInTimeZone("Europe/London", new Date("2026-01-16T00:30:00.000Z")),
    ).toBe("2026-01-16");
    const beforeMidnight = todayIsoInTimeZone(
      "Europe/London",
      new Date("2026-06-01T22:30:00.000Z"),
    );
    const afterMidnight = todayIsoInTimeZone(
      "Europe/London",
      new Date("2026-06-01T23:30:00.000Z"),
    );
    expect(followUpDueState("2026-06-01", beforeMidnight, "OPEN")).toBe("dueToday");
    expect(followUpDueState("2026-06-01", afterMidnight, "OPEN")).toBe("overdue");
  });
});

describe("follow-up ordering and edits", () => {
  it("orders open work by due group, then date or created time, then id", () => {
    const sorted = sortFollowUpsForDetail(
      [
        item({ id: "b", dueDateIso: "2026-06-03" }),
        item({ id: "a", dueDateIso: "2026-06-04" }),
        item({
          id: "late-created",
          dueDateIso: "2026-06-02",
          createdAt: new Date("2026-06-02T12:00:00.000Z"),
        }),
        item({
          id: "early-created",
          dueDateIso: "2026-06-02",
          createdAt: new Date("2026-06-02T08:00:00.000Z"),
        }),
        item({ id: "older-overdue", dueDateIso: "2026-05-01" }),
        item({ id: "newer-overdue", dueDateIso: "2026-05-20" }),
        item({
          id: "done",
          state: "COMPLETED",
          dueDateIso: "2026-05-01",
          completedAt: new Date("2026-06-02T09:00:00.000Z"),
        }),
        item({
          id: "cancelled",
          state: "CANCELLED",
          dueDateIso: "2026-05-01",
          cancelledAt: new Date("2026-06-03T09:00:00.000Z"),
        }),
      ],
      "2026-06-02",
    ).map((row) => row.id);
    expect(sorted).toEqual([
      "older-overdue",
      "newer-overdue",
      "early-created",
      "late-created",
      "b",
      "a",
      "cancelled",
      "done",
    ]);
    expect(
      compareOpenFollowUps(
        item({ id: "b", dueDateIso: "2026-05-01" }),
        item({ id: "a", dueDateIso: "2026-05-01" }),
        "2026-06-02",
      ),
    ).toBeGreaterThan(0);
  });

  it("rejects a no-change edit and an outcome that repeats the details", () => {
    expect(
      followUpEditIsNoChange(
        { dueDateIso: "2026-06-02", details: "Call venue" },
        { dueDateIso: "2026-06-02", details: "Call venue" },
      ),
    ).toBe(true);
    expect(
      followUpEditIsNoChange(
        { dueDateIso: "2026-06-02", details: "Call venue" },
        { dueDateIso: "2026-06-03", details: "Call venue" },
      ),
    ).toBe(false);
    expect(completionNotesReuseDetails("Call venue", "Call venue")).toBe(true);
    expect(completionNotesReuseDetails("Call venue", "Spoke to venue")).toBe(
      false,
    );
  });

  it("builds an audit diff only for changed follow-up fields", () => {
    expect(
      followUpUpdateChanges({
        previousDueDate: "2026-06-02",
        nextDueDate: "2026-06-03",
        previousDetails: "Call venue",
        nextDetails: "Call venue",
      }),
    ).toEqual([
      {
        field: "followUpDueDate",
        previous: "2026-06-02",
        next: "2026-06-03",
      },
    ]);
  });
});

describe("follow-up invariants", () => {
  it("accepts only the three state shapes", () => {
    expect(
      followUpStateFieldsValid({
        state: "OPEN",
        completionNotes: null,
        completedAt: null,
        completedById: null,
        cancellationReason: null,
        cancelledAt: null,
        cancelledById: null,
      }),
    ).toBe(true);
    expect(
      followUpStateFieldsValid({
        state: "COMPLETED",
        completionNotes: "Spoke to the venue",
        completedAt: new Date(),
        completedById: "user",
        cancellationReason: null,
        cancelledAt: null,
        cancelledById: null,
      }),
    ).toBe(true);
    expect(
      followUpStateFieldsValid({
        state: "COMPLETED",
        completionNotes: "Spoke to the venue",
        completedAt: new Date(),
        completedById: "user",
        cancellationReason: "No longer needed",
        cancelledAt: new Date(),
        cancelledById: "user",
      }),
    ).toBe(false);
    expect(
      followUpStateFieldsValid({
        state: "OPEN",
        completionNotes: "notes",
        completedAt: null,
        completedById: null,
        cancellationReason: null,
        cancelledAt: null,
        cancelledById: null,
      }),
    ).toBe(false);
    expect(followUpMutationsAllowed("ACTIVE")).toBe(true);
    expect(followUpMutationsAllowed("ARCHIVED")).toBe(false);
  });
});

describe("follow-up text and privacy", () => {
  it("trims and rejects short, long, and markup details", () => {
    const form = new FormData();
    form.set("absenceId", "absence");
    form.set("dueDate", "2026-06-02");
    form.set("details", "  Call the venue  ");
    form.set("idempotencyKey", "idem-key-1234");
    const parsed = parseCreateFollowUpFormData(form);
    expect(parsed.success && parsed.data.details).toBe("Call the venue");

    form.set("details", " x ");
    expect(parseCreateFollowUpFormData(form).success).toBe(false);
    form.set("details", "a".repeat(2001));
    expect(parseCreateFollowUpFormData(form).success).toBe(false);
    form.set("details", "Please <script>alert(1)</script> now");
    expect(parseCreateFollowUpFormData(form).success).toBe(false);
    form.set("details", "Wait until a < b is resolved");
    expect(parseCreateFollowUpFormData(form).success).toBe(true);
  });

  it("rejects an outcome that repeats the current details", () => {
    const form = new FormData();
    form.set("followUpId", "follow-up");
    form.set("completionNotes", "Call the venue");
    form.set("expectedUpdatedAt", "2026-06-02T10:00:00.000Z");
    form.set("idempotencyKey", "idem-key-1234");
    expect(parseCompleteFollowUpFormData(form, "Call the venue").success).toBe(
      false,
    );
    expect(parseCompleteFollowUpFormData(form, "Different task").success).toBe(
      true,
    );
  });

  it("redacts follow-up text from a public history feed and keeps it out of queue URLs", () => {
    const redacted = redactHistoryChangesForPublicFeed([
      { field: "followUpDueDate", previous: "2026-06-01", next: "2026-06-02" },
      {
        field: "followUpDetails",
        previous: "secret details",
        next: "new secret",
      },
    ]);
    expect(redacted).toEqual([
      { field: "followUpDueDate", previous: "2026-06-01", next: "2026-06-02" },
      {
        field: "followUpDetails",
        previous: FOLLOW_UP_DETAILS_CHANGED_MARKER,
        next: FOLLOW_UP_DETAILS_CHANGED_MARKER,
      },
    ]);
    expect(
      redactHistoryReasonForPublicFeed(
        "FOLLOW_UP_CANCELLED",
        "secret reason",
      ),
    ).toBe("Follow-up note changed");
    const href = followUpQueueHref({
      q: "Jamie",
      type: "SICKNESS",
      due: "overdue",
      page: 2,
    });
    expect(href).toBe("/follow-ups?q=Jamie&type=SICKNESS&due=overdue&page=2");
    expect(href).not.toContain("secret");
  });
});
