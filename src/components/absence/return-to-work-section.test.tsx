/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { AbsenceDetail } from "@/lib/absence/queries";
import { RETURN_TO_WORK_STATUSES } from "@/lib/absence/catalog";
import { RETURN_TO_WORK_STATUS_LABELS } from "@/lib/absence/return-to-work";

vi.mock("@/app/(app)/absence/return-to-work-actions", () => ({
  saveReturnToWorkAction: vi.fn(),
}));

vi.mock("@/app/(app)/absence/follow-up-actions", () => ({
  createFollowUpAction: vi.fn(),
  updateFollowUpAction: vi.fn(),
  completeFollowUpAction: vi.fn(),
  cancelFollowUpAction: vi.fn(),
}));

import { ReturnToWorkSection } from "@/components/absence/return-to-work-section";

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

function sicknessAbsence(
  overrides: {
    recordStatus?: "ACTIVE" | "ARCHIVED";
    status?: (typeof RETURN_TO_WORK_STATUSES)[number] | null;
    completedOn?: string | null;
    note?: string | null;
    type?: "SICKNESS" | "CANCELLATION";
  } = {},
): AbsenceDetail {
  const status = overrides.status;
  return {
    id: "absence-sickness",
    type: overrides.type ?? "SICKNESS",
    recordStatus: overrides.recordStatus ?? "ACTIVE",
    reportedDate: new Date("2026-09-14T00:00:00.000Z"),
    staff: {
      firstName: "Jamie",
      lastName: "Cole",
      staffIdNumber: "ST-1",
      deletedAt: null,
    },
    cancellation: null,
    awol: null,
    sickness:
      overrides.type === "CANCELLATION"
        ? null
        : {
            firstWorkingDaySick: new Date("2026-09-14T00:00:00.000Z"),
            episodeState: "ONGOING",
          },
    returnToWork: status
      ? {
          status,
          completedOn: overrides.completedOn
            ? new Date(`${overrides.completedOn}T00:00:00.000Z`)
            : null,
          note: overrides.note ?? null,
          updatedAt: new Date("2026-09-14T12:00:00.000Z"),
          updatedBy: { firstName: "Test", lastName: "Admin" },
        }
      : null,
    followUps: [],
  } as unknown as AbsenceDetail;
}

function submitNamed(name: string) {
  return screen
    .getAllByRole("button", { name })
    .find((button) => button.getAttribute("type") === "submit");
}

describe("return to work section", () => {
  it("shows Not recorded and the manual actions for a missing row", () => {
    render(
      <ReturnToWorkSection absence={sicknessAbsence()} todayIso="2026-09-14" />,
    );
    expect(screen.getAllByText("Not recorded").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Record return to work" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add follow-up" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Correct return to work" })).toBeNull();
  });

  it("hides the section for a cancellation", () => {
    const { container } = render(
      <ReturnToWorkSection
        absence={sicknessAbsence({ type: "CANCELLATION" })}
        todayIso="2026-09-14"
      />,
    );
    expect(container.textContent).toBe("");
  });

  it.each(RETURN_TO_WORK_STATUSES.filter((status) => status !== "NOT_RECORDED"))(
    "shows %s",
    (status) => {
      render(
        <ReturnToWorkSection
          absence={sicknessAbsence({
            status,
            completedOn: status === "COMPLETED" ? "2026-09-01" : null,
          })}
          todayIso="2026-09-14"
        />,
      );
      expect(
        screen.getAllByText(RETURN_TO_WORK_STATUS_LABELS[status]).length,
      ).toBeGreaterThan(0);
      if (status === "COMPLETED") {
        expect(screen.getAllByText(/Completion date/).length).toBeGreaterThan(0);
      }
    },
  );

  it("shows the completion date only for Completed", () => {
    render(
      <ReturnToWorkSection absence={sicknessAbsence()} todayIso="2026-09-14" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Record return to work" }));
    expect(screen.queryByLabelText(/Completion date/)).toBeNull();
    fireEvent.change(screen.getByLabelText(/Return to work/), {
      target: { value: "COMPLETED" },
    });
    expect(screen.getByLabelText(/Completion date/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Return to work/), {
      target: { value: "OUTSTANDING" },
    });
    expect(screen.queryByLabelText(/Completion date/)).toBeNull();
  });

  it("keeps a future date and a missing date after validation fails", async () => {
    render(
      <ReturnToWorkSection absence={sicknessAbsence()} todayIso="2026-09-14" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Record return to work" }));
    fireEvent.change(screen.getByLabelText(/Return to work/), {
      target: { value: "COMPLETED" },
    });
    const date = screen.getByLabelText(/Completion date/) as HTMLInputElement;
    fireEvent.change(date, { target: { value: "2026-09-15" } });
    fireEvent.change(screen.getByLabelText(/Administrative note/), {
      target: { value: "Keep this note" },
    });
    fireEvent.click(submitNamed("Save return to work")!);
    expect((screen.getByLabelText(/Completion date/) as HTMLInputElement).value).toBe(
      "2026-09-15",
    );
    expect(
      (screen.getByLabelText(/Administrative note/) as HTMLTextAreaElement).value,
    ).toBe("Keep this note");
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(
        "Check the form and try again.",
      );
    });

    fireEvent.change(screen.getByLabelText(/Completion date/), {
      target: { value: "" },
    });
    fireEvent.click(submitNamed("Save return to work")!);
    expect((screen.getByLabelText(/Completion date/) as HTMLInputElement).value).toBe(
      "",
    );
    expect(
      (screen.getByLabelText(/Administrative note/) as HTMLTextAreaElement).value,
    ).toBe("Keep this note");
  });

  it("warns before clearing a completion date and keeps the correction reason", async () => {
    render(
      <ReturnToWorkSection
        absence={sicknessAbsence({
          status: "COMPLETED",
          completedOn: "2026-09-01",
          note: "Keep this note",
        })}
        todayIso="2026-09-14"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Correct return to work" }));
    const dialog = screen.getByRole("dialog", { name: "Correct return to work" });
    fireEvent.change(within(dialog).getByLabelText(/Return to work/), {
      target: { value: "OUTSTANDING" },
    });
    expect(within(dialog).getByText(/will clear the completion date/)).toBeTruthy();
    expect(within(dialog).queryByLabelText(/Completion date/)).toBeNull();
    const reason = within(dialog).getByLabelText(
      /Correction reason/,
    ) as HTMLTextAreaElement;
    fireEvent.change(reason, { target: { value: "x" } });
    fireEvent.click(submitNamed("Save return to work")!);
    expect(
      (within(dialog).getByLabelText(/Correction reason/) as HTMLTextAreaElement)
        .value,
    ).toBe("x");
    expect(
      (within(dialog).getByLabelText(/Administrative note/) as HTMLTextAreaElement)
        .value,
    ).toBe("Keep this note");
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(
        "Check the form and try again.",
      );
    });
  });

  it("renders an archived record without mutation or add follow-up", () => {
    render(
      <ReturnToWorkSection
        absence={sicknessAbsence({
          recordStatus: "ARCHIVED",
          status: "OUTSTANDING",
          note: "<note>",
        })}
        todayIso="2026-09-14"
      />,
    );
    expect(screen.getByText("Outstanding")).toBeTruthy();
    expect(screen.getByText("<note>")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Correct return to work" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Record return to work" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add follow-up" })).toBeNull();
  });
});
