/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { AbsenceDetail } from "@/lib/absence/queries";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/app/(app)/absence/follow-up-actions", () => ({
  createFollowUpAction: vi.fn(),
  updateFollowUpAction: vi.fn(),
  completeFollowUpAction: vi.fn(),
  cancelFollowUpAction: vi.fn(),
}));

import {
  cancelFollowUpAction,
  completeFollowUpAction,
  updateFollowUpAction,
} from "@/app/(app)/absence/follow-up-actions";
import { AddFollowUpDialog } from "@/components/absence/follow-up-dialogs";
import { FollowUpDueSummary } from "@/components/absence/follow-up-due-summary";
import { FollowUpQueueFilters } from "@/components/absence/follow-up-queue-filters";
import { FollowUpsSection } from "@/components/absence/follow-ups-section";
import { FORM_CHECK_MESSAGE } from "@/lib/form";

beforeAll(() => {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal(
      this: HTMLDialogElement,
    ) {
      this.open = true;
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
      this.open = false;
    };
  }
});

afterEach(() => {
  cleanup();
});

describe("follow-up dialogs", () => {
  it("keeps entered details when create validation fails", async () => {
    render(
      <AddFollowUpDialog
        absenceId="absence-1"
        staffName="Jamie Cole"
        staffIdNumber="ST-1"
        typeLabel="Cancellation"
        context={["Matchday"]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add follow-up" }));
    const details = screen.getByLabelText(/Follow-up details/);
    fireEvent.change(details, { target: { value: "x" } });
    const submit = screen
      .getAllByRole("button", { name: "Add follow-up" })
      .find((button) => button.getAttribute("type") === "submit");
    expect(submit).toBeTruthy();
    fireEvent.click(submit!);
    expect(
      (screen.getByLabelText(/Follow-up details/) as HTMLTextAreaElement).value,
    ).toBe("x");
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(
        "Check the form and try again.",
      );
    });
  });
});

function emptyAbsence(type: "CANCELLATION" | "AWOL" | "SICKNESS"): AbsenceDetail {
  return {
    id: `absence-${type}`,
    type,
    recordStatus: "ACTIVE",
    reportedDate: new Date("2026-10-01T00:00:00.000Z"),
    staff: {
      firstName: "Ben",
      lastName: "Carter",
      staffIdNumber: "CC-IMP-1004",
      deletedAt: null,
    },
    cancellation:
      type === "CANCELLATION"
        ? {
            eventNameSnapshot: "Matchday",
            eventDateSnapshot: new Date("2026-10-05T00:00:00.000Z"),
            venueNameSnapshot: "Ground",
          }
        : null,
    awol:
      type === "AWOL"
        ? {
            eventNameSnapshot: "Away",
            eventDateSnapshot: new Date("2026-10-01T00:00:00.000Z"),
            venueNameSnapshot: "Ground",
            affectedDate: new Date("2026-10-01T00:00:00.000Z"),
          }
        : null,
    sickness:
      type === "SICKNESS"
        ? {
            firstWorkingDaySick: new Date("2026-09-30T00:00:00.000Z"),
            episodeState: "ONGOING",
          }
        : null,
    followUps: [],
  } as unknown as AbsenceDetail;
}

describe("empty follow-ups", () => {
  it.each(["CANCELLATION", "AWOL", "SICKNESS"] as const)(
    "shows the empty state for an active %s record",
    (type) => {
      render(
        <FollowUpsSection absence={emptyAbsence(type)} todayIso="2026-10-01" />,
      );
      expect(screen.getByText("No follow-ups recorded.")).toBeTruthy();
      expect(screen.getByText("0 open follow-ups")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Add follow-up" })).toBeTruthy();
      expect(screen.queryByText(/timezone/i)).toBeNull();
    },
  );

  it("keeps the empty state when a due label cannot be derived", () => {
    render(<FollowUpsSection absence={emptyAbsence("AWOL")} />);
    expect(screen.getByText("No follow-ups recorded.")).toBeTruthy();
    expect(screen.queryByText(/timezone/i)).toBeNull();
  });
});

describe("archived follow-ups", () => {
  it("shows history without mutation actions", () => {
    const absence = {
      id: "absence-1",
      type: "CANCELLATION",
      recordStatus: "ARCHIVED",
      reportedDate: new Date("2026-09-12T00:00:00.000Z"),
      staff: {
        firstName: "Jamie",
        lastName: "Cole",
        staffIdNumber: "ST-1",
        deletedAt: null,
      },
      cancellation: {
        eventNameSnapshot: "Matchday",
        eventDateSnapshot: new Date("2026-09-12T00:00:00.000Z"),
        venueNameSnapshot: "Ground",
      },
      awol: null,
      sickness: null,
      followUps: [
        {
          id: "follow-1",
          state: "OPEN",
          dueDate: new Date("2026-09-01T00:00:00.000Z"),
          details: "Call the venue about cover",
          completionNotes: null,
          completedAt: null,
          cancellationReason: null,
          cancelledAt: null,
          createdAt: new Date("2026-09-01T10:00:00.000Z"),
          updatedAt: new Date("2026-09-01T10:00:00.000Z"),
          createdBy: { firstName: "Lisa", lastName: "Admin" },
          completedBy: null,
          cancelledBy: null,
        },
      ],
    } as unknown as AbsenceDetail;

    render(
      <FollowUpsSection absence={absence} todayIso="2026-09-14" />,
    );
    expect(screen.getByText("Call the venue about cover")).toBeTruthy();
    expect(screen.getByText("Overdue")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add follow-up" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit follow-up" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Complete follow-up" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel follow-up" })).toBeNull();
  });
});

function openFollowUp(): AbsenceDetail {
  return {
    id: "absence-1",
    type: "AWOL",
    recordStatus: "ACTIVE",
    reportedDate: new Date("2026-09-12T00:00:00.000Z"),
    staff: {
      firstName: "Jamie",
      lastName: "Cole",
      staffIdNumber: "ST-1",
      deletedAt: null,
    },
    cancellation: null,
    awol: {
      eventNameSnapshot: "Matchday",
      eventDateSnapshot: new Date("2026-09-13T00:00:00.000Z"),
      venueNameSnapshot: "Ground",
      affectedDate: new Date("2026-09-13T00:00:00.000Z"),
    },
    sickness: null,
    followUps: [
      {
        id: "follow-1",
        state: "OPEN",
        dueDate: new Date("2026-09-14T00:00:00.000Z"),
        details: "Call the venue about cover",
        completionNotes: null,
        completedAt: null,
        cancellationReason: null,
        cancelledAt: null,
        createdAt: new Date("2026-09-01T10:00:00.000Z"),
        updatedAt: new Date("2026-09-01T10:00:00.000Z"),
        createdBy: { firstName: "Lisa", lastName: "Admin" },
        completedBy: null,
        cancelledBy: null,
      },
    ],
  } as unknown as AbsenceDetail;
}

function dialogByTitle(title: string) {
  const heading = screen.getByRole("heading", { name: title });
  const dialog = heading.closest("dialog");
  if (!dialog) {
    throw new Error(`missing dialog ${title}`);
  }
  return within(dialog);
}

function submitButton(
  name: string,
  scope: { getAllByRole: typeof screen.getAllByRole } = screen,
) {
  const button = scope
    .getAllByRole("button", { name })
    .find((candidate) => candidate.getAttribute("type") === "submit");
  if (!button) {
    throw new Error(`missing submit ${name}`);
  }
  return button;
}

describe("open follow-up mutations", () => {
  it("keeps the entered edit when validation fails", async () => {
    render(<FollowUpsSection absence={openFollowUp()} todayIso="2026-09-14" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit follow-up" }));
    const dialog = dialogByTitle("Edit follow-up");
    fireEvent.change(dialog.getByLabelText(/Follow-up details/), {
      target: { value: "x" },
    });
    fireEvent.change(dialog.getByLabelText(/Correction reason/), {
      target: { value: "Corrected the note" },
    });
    fireEvent.click(submitButton("Save follow-up", dialog));
    expect(
      (dialog.getByLabelText(/Follow-up details/) as HTMLTextAreaElement).value,
    ).toBe("x");
    expect(
      (dialog.getByLabelText(/Correction reason/) as HTMLTextAreaElement).value,
    ).toBe("Corrected the note");
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(FORM_CHECK_MESSAGE);
    });
    expect(updateFollowUpAction).not.toHaveBeenCalled();
  });

  it("submits a distinct outcome when completing a follow-up", async () => {
    vi.mocked(completeFollowUpAction).mockResolvedValue({});
    render(<FollowUpsSection absence={openFollowUp()} todayIso="2026-09-14" />);
    fireEvent.click(screen.getByRole("button", { name: "Complete follow-up" }));
    fireEvent.change(screen.getByLabelText(/Outcome/), {
      target: { value: "x" },
    });
    fireEvent.click(submitButton("Complete follow-up"));
    expect(
      (screen.getByLabelText(/Outcome/) as HTMLTextAreaElement).value,
    ).toBe("x");
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(FORM_CHECK_MESSAGE);
    });

    fireEvent.change(screen.getByLabelText(/Outcome/), {
      target: { value: "Cover was arranged with the venue." },
    });
    fireEvent.click(submitButton("Complete follow-up"));
    await waitFor(() => {
      expect(completeFollowUpAction).toHaveBeenCalled();
    });
  });

  it("requires a cancellation reason and does not offer delete", async () => {
    vi.mocked(cancelFollowUpAction).mockResolvedValue({});
    render(<FollowUpsSection absence={openFollowUp()} todayIso="2026-09-14" />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel follow-up" }));
    expect(screen.queryByRole("button", { name: /Delete/i })).toBeNull();
    expect(screen.getByRole("button", { name: "Keep follow-up" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Cancellation reason/), {
      target: { value: "x" },
    });
    fireEvent.click(submitButton("Cancel follow-up"));
    expect(
      (screen.getByLabelText(/Cancellation reason/) as HTMLTextAreaElement)
        .value,
    ).toBe("x");
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(FORM_CHECK_MESSAGE);
    });

    fireEvent.change(screen.getByLabelText(/Cancellation reason/), {
      target: { value: "No longer required." },
    });
    fireEvent.click(submitButton("Cancel follow-up"));
    await waitFor(() => {
      expect(cancelFollowUpAction).toHaveBeenCalled();
    });
  });
});

describe("follow-up queue links", () => {
  it("links each due group to the filtered queue and clears filters", () => {
    render(
      <FollowUpDueSummary
        counts={{ overdue: 2, dueToday: 1, upcoming: 4 }}
      />,
    );
    expect(screen.getByRole("link", { name: /Overdue/ }).getAttribute("href")).toBe(
      "/follow-ups?due=overdue",
    );
    expect(
      screen.getByRole("link", { name: /Due today/ }).getAttribute("href"),
    ).toBe("/follow-ups?due=dueToday");
    expect(
      screen.getByRole("link", { name: /Upcoming/ }).getAttribute("href"),
    ).toBe("/follow-ups?due=upcoming");

    render(
      <FollowUpQueueFilters
        query={{
          q: "Cole",
          type: "AWOL",
          due: "overdue",
          page: 1,
          detail: "",
        }}
      />,
    );
    expect(
      screen.getByRole("link", { name: "Clear filters" }).getAttribute("href"),
    ).toBe("/follow-ups");
    expect(
      (screen.getByLabelText("Due") as HTMLSelectElement).value,
    ).toBe("overdue");
  });
});
