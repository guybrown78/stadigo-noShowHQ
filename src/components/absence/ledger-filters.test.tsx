/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LedgerActiveFilters } from "@/components/absence/ledger-active-filters";
import { LedgerQuickFilters } from "@/components/absence/ledger-quick-filters";
import { defaultLedgerListQuery } from "@/lib/absence/schema";

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

describe("ledger quick filters", () => {
  it("applies archived, unauthorised, and fit-note choices without the form", () => {
    const cancellations = {
      ...defaultLedgerListQuery("cancellations"),
      q: "Jamal",
    };
    const { unmount } = render(<LedgerQuickFilters query={cancellations} />);

    expect(
      screen.getByRole("link", { name: "Active" }).getAttribute("href"),
    ).toBe("/ledger?view=cancellations&q=Jamal");
    expect(
      screen
        .getByRole("link", { name: "Active and archived" })
        .getAttribute("href"),
    ).toBe("/ledger?view=cancellations&q=Jamal&includeArchived=1");
    expect(
      screen.getByRole("link", { name: "Unauthorised only" }).getAttribute("href"),
    ).toBe("/ledger?view=cancellations&q=Jamal&unauthorised=1");
    expect(
      screen.getByRole("link", { name: "Unauthorised only" }).hasAttribute("aria-current"),
    ).toBe(false);

    unmount();
    render(
      <LedgerQuickFilters
        query={{
          ...defaultLedgerListQuery("sickness"),
          evidenceStatus: "overdue",
        }}
      />,
    );
    expect(
      screen.getByRole("link", { name: "Chase overdue" }).getAttribute("href"),
    ).toBe("/ledger?view=sickness&evidenceStatus=overdue");
    expect(
      screen.getByRole("link", { name: "Chase overdue" }).getAttribute("aria-current"),
    ).toBe("page");
  });
});

describe("ledger active filters", () => {
  it("removes one filter at a time and keeps the view and sort when clearing", () => {
    const query = {
      ...defaultLedgerListQuery("cancellations"),
      q: "Jamal",
      venue: "venue_1",
      unauthorised: true,
      sort: "staff" as const,
      direction: "asc" as const,
      page: 2,
    };
    render(
      <LedgerActiveFilters
        query={query}
        periodLabel=""
        venueName="West Ham, London Stadium"
        eventTypeName=""
        showClear
      />,
    );

    expect(
      screen.getByRole("link", { name: "Remove search Jamal" }).getAttribute("href"),
    ).toBe(
      "/ledger?view=cancellations&venue=venue_1&sort=staff&direction=asc&unauthorised=1",
    );
    expect(
      screen
        .getByRole("link", { name: "Remove unauthorised only" })
        .getAttribute("href"),
    ).toBe(
      "/ledger?view=cancellations&q=Jamal&venue=venue_1&sort=staff&direction=asc",
    );
    expect(
      screen.getByRole("link", { name: "Clear filters" }).getAttribute("href"),
    ).toBe("/ledger?view=cancellations&sort=staff&direction=asc");
    expect(screen.queryByText(/Sickness records stay hidden/)).toBeNull();
  });

  it("says sickness stays hidden while a venue filter is on for all absences", () => {
    render(
      <LedgerActiveFilters
        query={{
          ...defaultLedgerListQuery("all"),
          venue: "venue_1",
        }}
        periodLabel=""
        venueName="Alexandra Palace"
        eventTypeName=""
        showClear
      />,
    );
    expect(
      screen.getByText(
        "Sickness records stay hidden while this venue filter is on.",
      ),
    ).toBeTruthy();
  });
});
