/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/settings/actions", () => ({
  updateSicknessEvidenceSettingsAction: vi.fn(),
}));

import { SicknessEvidenceSettingsForm } from "@/components/absence/sickness-evidence-settings-form";

afterEach(() => {
  cleanup();
});

describe("sickness evidence settings form", () => {
  it("keeps a rejected day count in the field and points the error at it", async () => {
    render(
      <SicknessEvidenceSettingsForm requiredFromDay={8} chaseAfterDays={5} />,
    );
    const required = screen.getByLabelText(/Fit note required from sickness day/);
    fireEvent.change(required, { target: { value: "0" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Save sickness evidence settings" }),
    );
    expect(await screen.findByText(/whole number from 1 to 730/)).toBeTruthy();
    expect((required as HTMLInputElement).value).toBe("0");
    expect(required.getAttribute("aria-invalid")).toBe("true");
    expect(required.getAttribute("aria-describedby")).toContain("error");
  });
});
