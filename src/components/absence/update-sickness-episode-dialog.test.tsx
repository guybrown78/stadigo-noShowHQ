/**
 * @vitest-environment jsdom
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FORM_CHECK_MESSAGE } from "@/lib/form";
import {
  SICKNESS_ENDED_BEFORE_FIRST_DAY_MESSAGE,
  SICKNESS_ENDED_DATE_HINT,
  SICKNESS_ENDED_FUTURE_MESSAGE,
  SICKNESS_ENDED_REQUIRED_MESSAGE,
  SICKNESS_EPISODE_CONFIRM_CLEAR_MESSAGE,
  SICKNESS_EPISODE_UPDATE_LABEL,
} from "@/lib/absence/sickness";
import type { SicknessEpisodeState } from "@/lib/absence/catalog";

const updateSicknessEpisodeAction = vi.hoisted(() => vi.fn());

vi.mock("@/app/(app)/absence/actions", () => ({
  updateSicknessEpisodeAction,
}));

import { UpdateSicknessEpisodeDialog } from "@/components/absence/update-sickness-episode-dialog";

const baseProps = {
  absenceId: "absence_1",
  staffName: "Jamal Ahmed",
  reportedDateDisplay: "14 Sep 2026",
  firstWorkingDayDisplay: "14 Sep 2026",
  firstWorkingDaySick: "2026-09-14",
  sicknessStartedDate: "",
  currentEpisodeState: "ONGOING" as SicknessEpisodeState,
  currentSicknessEndedDate: "",
  expectedUpdatedAt: "2026-09-14T12:00:00.000Z",
  todayIso: "2026-09-14",
  timeZone: "Europe/London",
};

function renderDialog(
  overrides: Partial<typeof baseProps> = {},
) {
  return render(
    <UpdateSicknessEpisodeDialog {...baseProps} {...overrides} />,
  );
}

function radio(name: "Ongoing" | "Ended") {
  return screen.getByRole("radio", { name }) as HTMLInputElement;
}

async function openDialog() {
  await act(async () => {
    screen.getByRole("button", { name: SICKNESS_EPISODE_UPDATE_LABEL }).click();
  });
}

async function submitUpdate() {
  const form = screen
    .getByRole("button", { name: "Save episode update" })
    .closest("form");
  if (!form) {
    throw new Error("episode form missing");
  }
  await act(async () => {
    form.requestSubmit();
  });
}

function describedText(control: HTMLElement) {
  const ids = control.getAttribute("aria-describedby")?.split(/\s+/) ?? [];
  return ids
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");
}

beforeAll(() => {
  // jsdom does not implement the dialog methods this form uses to open.
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal(
      this: HTMLDialogElement,
    ) {
      this.setAttribute("open", "");
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    };
  }
});

beforeEach(() => {
  updateSicknessEpisodeAction.mockReset();
  updateSicknessEpisodeAction.mockResolvedValue({});
});

afterEach(() => {
  cleanup();
});

describe("UpdateSicknessEpisodeDialog validation recovery", () => {
  it("keeps Ended and the empty date after a required-date failure", async () => {
    renderDialog();
    await openDialog();
    await act(async () => {
      radio("Ended").click();
    });

    await submitUpdate();

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(FORM_CHECK_MESSAGE);
    });
    expect(radio("Ended").checked).toBe(true);
    expect(radio("Ongoing").checked).toBe(false);
    const date = screen.getByLabelText(/Sickness ended/) as HTMLInputElement;
    expect(date.value).toBe("");
    expect(date.getAttribute("aria-invalid")).toBe("true");
    expect(describedText(date)).toContain(SICKNESS_ENDED_REQUIRED_MESSAGE);
    expect(describedText(date)).toContain(SICKNESS_ENDED_DATE_HINT);
    expect(screen.getByText(SICKNESS_ENDED_DATE_HINT, { exact: false })).toBeTruthy();
    expect(updateSicknessEpisodeAction).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(date);
  });

  it("keeps a future Ended date so it can be corrected", async () => {
    renderDialog();
    await openDialog();
    await act(async () => {
      radio("Ended").click();
    });
    const date = screen.getByLabelText(/Sickness ended/) as HTMLInputElement;
    fireEvent.change(date, { target: { value: "2026-09-15" } });

    await submitUpdate();

    await waitFor(() => {
      expect(describedText(date)).toContain(SICKNESS_ENDED_FUTURE_MESSAGE);
    });
    expect(radio("Ended").checked).toBe(true);
    expect(radio("Ongoing").checked).toBe(false);
    expect(date.value).toBe("2026-09-15");
    expect(date.getAttribute("aria-invalid")).toBe("true");
  });

  it("keeps a pre-start Ended date so it can be corrected", async () => {
    renderDialog();
    await openDialog();
    await act(async () => {
      radio("Ended").click();
    });
    const date = screen.getByLabelText(/Sickness ended/) as HTMLInputElement;
    fireEvent.change(date, { target: { value: "2026-09-01" } });

    await submitUpdate();

    await waitFor(() => {
      expect(describedText(date)).toContain(
        SICKNESS_ENDED_BEFORE_FIRST_DAY_MESSAGE,
      );
    });
    expect(radio("Ended").checked).toBe(true);
    expect(date.value).toBe("2026-09-01");
    expect(date.getAttribute("aria-invalid")).toBe("true");
  });

  it("keeps an ended correction when the reason is missing", async () => {
    renderDialog({
      currentEpisodeState: "ENDED",
      currentSicknessEndedDate: "2026-09-14",
      todayIso: "2026-09-20",
    });
    await openDialog();
    expect(radio("Ended").checked).toBe(true);
    const date = screen.getByLabelText(/Sickness ended/) as HTMLInputElement;
    fireEvent.change(date, { target: { value: "2026-09-16" } });
    const reason = screen.getByLabelText(/Correction reason/) as HTMLTextAreaElement;
    fireEvent.change(reason, { target: { value: "x" } });

    await submitUpdate();

    await waitFor(() => {
      expect(reason.getAttribute("aria-invalid")).toBe("true");
    });
    expect(radio("Ended").checked).toBe(true);
    expect(radio("Ongoing").checked).toBe(false);
    expect(date.value).toBe("2026-09-16");
    expect(reason.value).toBe("x");
    expect(describedText(reason)).toMatch(/Correction reason must be at least/);
    expect(updateSicknessEpisodeAction).not.toHaveBeenCalled();
  });

  it("keeps Ongoing and the confirmation control when confirmation is missing", async () => {
    renderDialog({
      currentEpisodeState: "ENDED",
      currentSicknessEndedDate: "2026-09-14",
      todayIso: "2026-09-20",
    });
    await openDialog();
    await act(async () => {
      radio("Ongoing").click();
    });
    const confirmation = screen.getByRole("checkbox") as HTMLInputElement;
    expect(confirmation.checked).toBe(false);

    await submitUpdate();

    await waitFor(() => {
      expect(confirmation.getAttribute("aria-invalid")).toBe("true");
    });
    expect(radio("Ongoing").checked).toBe(true);
    expect(radio("Ended").checked).toBe(false);
    expect(confirmation.checked).toBe(false);
    expect(describedText(confirmation)).toContain(
      SICKNESS_EPISODE_CONFIRM_CLEAR_MESSAGE,
    );
    expect(
      screen.getByLabelText(/Correction reason/) as HTMLTextAreaElement,
    ).toBeTruthy();
    expect(screen.queryByLabelText(/Sickness ended/)).toBeNull();
  });

  it("closes on Cancel without calling the server action", async () => {
    renderDialog();
    await openDialog();
    await act(async () => {
      radio("Ended").click();
    });
    const dialog = document.querySelector("dialog");
    expect(dialog?.open).toBe(true);

    await act(async () => {
      screen.getByRole("button", { name: "Cancel" }).click();
    });

    expect(dialog?.open).toBe(false);
    expect(updateSicknessEpisodeAction).not.toHaveBeenCalled();
  });

  it("resubmits the corrected Ended date without returning to Ongoing", async () => {
    renderDialog();
    await openDialog();
    await act(async () => {
      radio("Ended").click();
    });
    await submitUpdate();
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(FORM_CHECK_MESSAGE);
    });

    const date = screen.getByLabelText(/Sickness ended/) as HTMLInputElement;
    fireEvent.change(date, { target: { value: "2026-09-14" } });
    expect(radio("Ended").checked).toBe(true);

    await submitUpdate();

    await waitFor(() => {
      expect(updateSicknessEpisodeAction).toHaveBeenCalledTimes(1);
    });
    const formData = updateSicknessEpisodeAction.mock.calls[0][1] as FormData;
    expect(formData.get("episodeState")).toBe("ENDED");
    expect(formData.get("sicknessEndedDate")).toBe("2026-09-14");
    expect(radio("Ended").checked).toBe(true);
    expect(radio("Ongoing").checked).toBe(false);
    expect(date.value).toBe("2026-09-14");
  });
});
