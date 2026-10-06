/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { AbsenceDetail } from "@/lib/absence/queries";
import { FIT_NOTE_STATUSES, SELF_CERTIFICATION_STATUSES } from "@/lib/absence/catalog";
import {
  FIT_NOTE_STATUS_LABELS,
  SELF_CERTIFICATION_STATUS_LABELS,
} from "@/lib/absence/evidence";

vi.mock("@/app/(app)/absence/evidence-actions", () => ({
  saveSelfCertificationAction: vi.fn(),
  createFitNoteAction: vi.fn(),
  updateFitNoteAction: vi.fn(),
}));

vi.mock("@/app/(app)/absence/follow-up-actions", () => ({
  createFollowUpAction: vi.fn(),
  updateFollowUpAction: vi.fn(),
  completeFollowUpAction: vi.fn(),
  cancelFollowUpAction: vi.fn(),
}));

import { EvidenceSection } from "@/components/absence/evidence-section";

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
    selfStatus?: (typeof SELF_CERTIFICATION_STATUSES)[number] | null;
    fitNotes?: Array<{
      status: (typeof FIT_NOTE_STATUSES)[number];
      requestedDate?: string | null;
      receivedDate?: string | null;
      note?: string | null;
    }>;
  } = {},
): AbsenceDetail {
  const selfStatus = overrides.selfStatus;
  return {
    id: "absence-sickness",
    type: "SICKNESS",
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
    sickness: {
      firstWorkingDaySick: new Date("2026-09-14T00:00:00.000Z"),
      episodeState: "ONGOING",
    },
    selfCertification: selfStatus
      ? {
          status: selfStatus,
          updatedAt: new Date("2026-09-14T12:00:00.000Z"),
          updatedBy: { firstName: "Test", lastName: "Admin" },
        }
      : null,
    fitNotes: (overrides.fitNotes ?? []).map((fitNote, index) => ({
      id: `fit-${index}`,
      status: fitNote.status,
      requestedDate: fitNote.requestedDate
        ? new Date(`${fitNote.requestedDate}T00:00:00.000Z`)
        : null,
      receivedDate: fitNote.receivedDate
        ? new Date(`${fitNote.receivedDate}T00:00:00.000Z`)
        : null,
      note: fitNote.note ?? null,
      updatedAt: new Date("2026-09-14T12:00:00.000Z"),
      createdAt: new Date(`2026-09-0${index + 1}T12:00:00.000Z`),
      updatedBy: { firstName: "Test", lastName: "Admin" },
    })),
    followUps: [],
  } as unknown as AbsenceDetail;
}

function submitNamed(name: string) {
  return screen
    .getAllByRole("button", { name })
    .find((button) => button.getAttribute("type") === "submit");
}

describe("sickness evidence section", () => {
  it("shows Not recorded and the manual actions for an empty active record", () => {
    render(<EvidenceSection absence={sicknessAbsence()} todayIso="2026-09-14" />);
    expect(screen.getAllByText("Not recorded").length).toBeGreaterThanOrEqual(2);
    expect(
      screen.getByRole("button", { name: "Record self-certification" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add fit note" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add follow-up" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit fit note" })).toBeNull();
  });

  it.each(SELF_CERTIFICATION_STATUSES.filter((status) => status !== "NOT_RECORDED"))(
    "shows self-certification %s",
    (status) => {
      render(
        <EvidenceSection
          absence={sicknessAbsence({ selfStatus: status })}
          todayIso="2026-09-14"
        />,
      );
      expect(
        screen.getAllByText(SELF_CERTIFICATION_STATUS_LABELS[status]).length,
      ).toBeGreaterThan(0);
      expect(
        screen.getByRole("button", { name: "Edit self-certification" }),
      ).toBeTruthy();
    },
  );

  it.each(FIT_NOTE_STATUSES)("shows fit note status %s", (status) => {
    render(
      <EvidenceSection
        absence={sicknessAbsence({
          fitNotes: [
            {
              status,
              requestedDate: status === "REQUESTED" || status === "RECEIVED" ? "2026-09-01" : null,
              receivedDate: status === "RECEIVED" ? "2026-09-10" : null,
              note: status === "REQUIRED" ? "Chased the manager" : null,
            },
          ],
        })}
        todayIso="2026-09-14"
      />,
    );
    expect(
      screen.getAllByText(FIT_NOTE_STATUS_LABELS[status]).length,
    ).toBeGreaterThan(0);
    const requested = screen.queryByText(/1 Sept 2026/);
    const received = screen.queryByText(/10 Sept 2026/);
    if (status === "REQUESTED" || status === "RECEIVED") {
      expect(requested).toBeTruthy();
    } else {
      expect(requested).toBeNull();
    }
    if (status === "RECEIVED") {
      expect(received).toBeTruthy();
    } else {
      expect(received).toBeNull();
    }
  });

  it("shows date fields only for the selected fit note status", () => {
    render(<EvidenceSection absence={sicknessAbsence()} todayIso="2026-09-14" />);
    fireEvent.click(screen.getByRole("button", { name: "Add fit note" }));
    expect(screen.queryByLabelText(/Date requested/)).toBeNull();
    expect(screen.queryByLabelText(/Date received/)).toBeNull();

    fireEvent.change(screen.getByLabelText(/Fit note/), {
      target: { value: "REQUESTED" },
    });
    expect(screen.getByLabelText(/Date requested/)).toBeTruthy();
    expect(screen.queryByLabelText(/Date received/)).toBeNull();

    fireEvent.change(screen.getByLabelText(/Fit note/), {
      target: { value: "RECEIVED" },
    });
    expect(screen.getByLabelText(/Date requested/)).toBeTruthy();
    expect(screen.getByLabelText(/Date received/)).toBeTruthy();
  });

  it("keeps a future date after validation fails", async () => {
    render(<EvidenceSection absence={sicknessAbsence()} todayIso="2026-09-14" />);
    fireEvent.click(screen.getByRole("button", { name: "Add fit note" }));
    fireEvent.change(screen.getByLabelText(/Fit note/), {
      target: { value: "REQUESTED" },
    });
    const requested = screen.getByLabelText(/Date requested/) as HTMLInputElement;
    fireEvent.change(requested, { target: { value: "2026-09-15" } });
    fireEvent.click(submitNamed("Add fit note")!);
    expect((screen.getByLabelText(/Date requested/) as HTMLInputElement).value).toBe(
      "2026-09-15",
    );
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(
        "Check the form and try again.",
      );
    });
  });

  it("requires a correction reason and keeps the note when edit validation fails", async () => {
    render(
      <EvidenceSection
        absence={sicknessAbsence({
          fitNotes: [{ status: "REQUIRED", note: "Keep this note" }],
        })}
        todayIso="2026-09-14"
      />,
    );
    expect(screen.getAllByText("Keep this note").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Edit fit note" }));
    const dialog = screen.getByRole("dialog", { name: "Edit fit note" });
    const reason = within(dialog).getByLabelText(
      /Correction reason/,
    ) as HTMLTextAreaElement;
    fireEvent.change(reason, { target: { value: "x" } });
    fireEvent.click(submitNamed("Save fit note")!);
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

  it("renders an archived record without edit or add actions", () => {
    render(
      <EvidenceSection
        absence={sicknessAbsence({
          recordStatus: "ARCHIVED",
          selfStatus: "AWAITING",
          fitNotes: [{ status: "REQUESTED", requestedDate: "2026-09-01", note: "<note>" }],
        })}
        todayIso="2026-09-14"
      />,
    );
    expect(screen.getByText("Awaiting")).toBeTruthy();
    expect(screen.getByText("<note>")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit self-certification" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add fit note" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit fit note" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add follow-up" })).toBeNull();
  });
});
