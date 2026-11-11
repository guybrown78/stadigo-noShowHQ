/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RepeatAbsences } from "@/components/dashboard/repeat-absences";
import type { DashboardRepeatRow } from "@/lib/absence/dashboard-query";

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

afterEach(() => {
  cleanup();
});

function row(index: number): DashboardRepeatRow {
  return {
    staffId: `staff-${index}`,
    firstName: "Alex",
    lastName: `Person ${index}`,
    roleTitle: "Steward",
    cancellation: 0,
    awol: 0,
    sickness: index,
    total: index,
  };
}

describe("repeated absences preview", () => {
  it("shows the five highest rows and expands the rest in place", () => {
    const rows = [7, 6, 5, 4, 3, 2, 1].map(row);
    render(<RepeatAbsences rows={rows} filtersActive={false} />);

    expect(screen.getByRole("link", { name: /Person 7/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Person 3/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Person 2/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show all 7" }));
    expect(screen.getByRole("link", { name: /Person 2/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Person 1/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Show less" }));
    expect(screen.queryByRole("link", { name: /Person 2/ })).toBeNull();
  });

  it("leaves a short list unchanged", () => {
    render(<RepeatAbsences rows={[row(4), row(2)]} filtersActive={false} />);
    expect(screen.getByRole("link", { name: /Person 2/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Show all/ })).toBeNull();
  });
});
