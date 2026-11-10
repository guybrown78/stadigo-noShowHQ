/**
 * @vitest-environment jsdom
 */
import { useState, type FormEvent } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  AbsenceRecord,
  LogNewAbsenceLink,
} from "@/components/absence/log-new-absence-link";

const push = vi.fn();

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

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

function StatusSelect() {
  const [status, setStatus] = useState("ONGOING");
  return (
    <select
      aria-label="Sickness status"
      value={status}
      onChange={(event) => setStatus(event.target.value)}
    >
      <option value="ONGOING">Ongoing</option>
      <option value="ENDED">Ended</option>
    </select>
  );
}

function Record({ children }: { children?: React.ReactNode }) {
  return (
    <AbsenceRecord>
      {children}
      <LogNewAbsenceLink size="md" />
    </AbsenceRecord>
  );
}

describe("Log new absence unsaved warning", () => {
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
        this.dispatchEvent(new Event("close"));
      };
    }
  });

  afterEach(() => {
    cleanup();
    push.mockClear();
  });

  it("opens a blank absence form when the record has no unsaved changes", () => {
    render(
      <Record>
        <form>
          <textarea aria-label="Archive reason" defaultValue="" />
        </form>
      </Record>,
    );

    fireEvent.click(screen.getByRole("link", { name: "Log new absence" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Log new absence" }).getAttribute("href"),
    ).toBe("/absence/new");
    expect(push).not.toHaveBeenCalled();
  });

  it("warns before leaving edited fields, and staying keeps them", () => {
    const submit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });
    render(
      <Record>
        <form onSubmit={submit}>
          <label>
            Move to
            <select aria-label="Pay period" defaultValue="current">
              <option value="current">Current</option>
              <option value="next">Next</option>
            </select>
          </label>
          <textarea aria-label="Follow-up details" defaultValue="" />
        </form>
      </Record>,
    );

    fireEvent.change(screen.getByLabelText("Pay period"), {
      target: { value: "next" },
    });
    fireEvent.change(screen.getByLabelText("Follow-up details"), {
      target: { value: "Call tomorrow" },
    });
    fireEvent.click(screen.getByRole("link", { name: "Log new absence" }));

    expect(screen.getByRole("dialog", { name: "Leave this record?" })).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Stay" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      (screen.getByLabelText("Follow-up details") as HTMLTextAreaElement).value,
    ).toBe("Call tomorrow");
    expect((screen.getByLabelText("Pay period") as HTMLSelectElement).value).toBe(
      "next",
    );
    expect(push).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it("leaves without saving only after that choice, and does not submit the record", () => {
    const submit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });
    render(
      <Record>
        <form onSubmit={submit}>
          <StatusSelect />
        </form>
      </Record>,
    );

    fireEvent.change(screen.getByLabelText("Sickness status"), {
      target: { value: "ENDED" },
    });
    fireEvent.click(screen.getByRole("link", { name: "Log new absence" }));
    fireEvent.click(screen.getByRole("button", { name: "Leave without saving" }));

    expect(push).toHaveBeenCalledExactlyOnceWith("/absence/new");
    expect(submit).not.toHaveBeenCalled();
  });

  it("ignores hidden fields and changes outside the record", () => {
    render(
      <>
        <form>
          <input aria-label="Ledger search" defaultValue="" />
        </form>
        <Record>
          <form>
            <input type="hidden" name="absenceId" defaultValue="abs-1" />
          </form>
        </Record>
      </>,
    );

    fireEvent.change(screen.getByLabelText("Ledger search"), {
      target: { value: "Ben" },
    });
    const hidden = document.querySelector("input[name='absenceId']");
    if (!(hidden instanceof HTMLInputElement)) throw new Error("missing hidden field");
    hidden.value = "changed";
    fireEvent.click(screen.getByRole("link", { name: "Log new absence" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });

  it("does not warn after an edit is put back", () => {
    render(
      <Record>
        <form>
          <textarea aria-label="Archive reason" defaultValue="" />
        </form>
      </Record>,
    );

    const reason = screen.getByLabelText("Archive reason");
    fireEvent.change(reason, { target: { value: "Mistake" } });
    fireEvent.change(reason, { target: { value: "" } });
    fireEvent.click(screen.getByRole("link", { name: "Log new absence" }));

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
