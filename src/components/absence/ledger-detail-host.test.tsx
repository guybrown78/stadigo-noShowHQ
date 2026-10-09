/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { AbsenceDetail } from "@/lib/absence/queries";
import type { LedgerAbsenceDetailResult } from "@/app/(app)/ledger/detail-action";
import type { LedgerDrawerPreview } from "@/lib/absence/ledger-drawer-preview";

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
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/app/(app)/ledger/detail-action", () => ({
  loadLedgerAbsenceDetail: vi.fn(),
}));

vi.mock("@/app/(app)/absence/actions", () => ({
  archiveSicknessAction: vi.fn(),
  archiveAwolAction: vi.fn(),
  archiveCancellationAction: vi.fn(),
  updateSicknessEpisodeAction: vi.fn(),
}));

vi.mock("@/app/(app)/absence/follow-up-actions", () => ({
  createFollowUpAction: vi.fn(),
  updateFollowUpAction: vi.fn(),
  completeFollowUpAction: vi.fn(),
  cancelFollowUpAction: vi.fn(),
}));

vi.mock("@/app/(app)/absence/evidence-actions", () => ({
  saveSelfCertificationAction: vi.fn(),
  createFitNoteAction: vi.fn(),
  updateFitNoteAction: vi.fn(),
  createReplacementEvidenceTaskAction: vi.fn(),
}));

vi.mock("@/app/(app)/absence/return-to-work-actions", () => ({
  saveReturnToWorkAction: vi.fn(),
}));

import { loadLedgerAbsenceDetail } from "@/app/(app)/ledger/detail-action";
import {
  LedgerDetailHost,
  ViewAbsenceButton,
} from "@/components/absence/ledger-detail-host";

const loadDetail = vi.mocked(loadLedgerAbsenceDetail);

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: () => ({
      matches: true,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
});

afterEach(() => {
  cleanup();
  loadDetail.mockReset();
  window.history.replaceState(null, "", "/");
});

function preview(
  overrides: Partial<LedgerDrawerPreview> &
    Pick<LedgerDrawerPreview, "id" | "type" | "fullPageLabel">,
): LedgerDrawerPreview {
  return {
    recordStatus: "ACTIVE",
    statusLabel: "Active",
    heading: "Ongoing",
    staffName: "Jamie Cole",
    staffIdNumber: "ST-9",
    staffHref: "/staff/staff-1",
    fields: [
      {
        label: overrides.type === "CANCELLATION" ? "Event" : "Event details",
        lines:
          overrides.type === "CANCELLATION"
            ? ["Arena Night"]
            : overrides.type === "AWOL"
              ? ["Gate Shift", "North Gate"]
              : ["14 Sep 2026"],
      },
    ],
    pendingLabels:
      overrides.type === "SICKNESS"
        ? ["Issue summary"]
        : overrides.type === "AWOL"
          ? ["Internal notes"]
          : ["Reason"],
    sectionSkeletons: ["History"],
    ...overrides,
  };
}

function absence(type: AbsenceDetail["type"], text: string): AbsenceDetail {
  const date = new Date("2026-09-14T00:00:00.000Z");
  const created = new Date("2026-09-14T09:00:00.000Z");
  return {
    id:
      type === "SICKNESS" ? "sick-1" : type === "AWOL" ? "awol-1" : "cancel-1",
    type,
    recordStatus: "ACTIVE",
    reportedDate: date,
    reportedTime: null,
    createdAt: created,
    updatedAt: created,
    archivedAt: null,
    archiveReason: null,
    notes: type === "AWOL" ? text : null,
    reason: type === "CANCELLATION" ? text : null,
    createdBy: { firstName: "Pat", lastName: "Admin" },
    updatedBy: { firstName: "Pat", lastName: "Admin" },
    archivedBy: null,
    staff: {
      id: "staff-1",
      firstName: "Jamie",
      lastName: "Cole",
      staffIdNumber: "ST-9",
      roleTitle: "Steward",
      employmentStatus: "ACTIVE",
      deletedAt: null,
    },
    event: null,
    cancellation:
      type === "CANCELLATION"
        ? {
            eventNameSnapshot: "Arena Night",
            eventDateSnapshot: date,
            venueNameSnapshot: "Arena",
            noticeMinutes: null,
            noticeCalendarDays: 3,
            noticeBasis: "CALENDAR_DATE",
            isShortNotice: false,
          }
        : null,
    awol:
      type === "AWOL"
        ? {
            eventNameSnapshot: "Gate Shift",
            eventReferenceSnapshot: "EV-2",
            eventDateSnapshot: date,
            venueNameSnapshot: "North Gate",
            eventTypeSnapshot: "Concert",
            eventSubtypeSnapshot: null,
            eventStartTimeSnapshot: null,
            eventEndTimeSnapshot: null,
          }
        : null,
    sickness:
      type === "SICKNESS"
        ? {
            firstWorkingDaySick: date,
            sicknessStartedDate: null,
            sicknessEndedDate: null,
            episodeState: "ONGOING",
            issueSummary: text,
            evidenceRequiredFromDay: null,
            evidenceRequirementDate: null,
          }
        : null,
    selfCertification: null,
    fitNotes: [],
    returnToWork: null,
    followUps: [],
    history: [],
  } as unknown as AbsenceDetail;
}

function deferred() {
  let resolve: (result: LedgerAbsenceDetailResult) => void = () => {};
  const promise = new Promise<LedgerAbsenceDetailResult>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function renderHost(
  items: LedgerDrawerPreview[],
  options: { initialDetailId?: string; listHref?: string } = {},
) {
  const listHref = options.listHref ?? "/ledger?view=sickness";
  return render(
    <LedgerDetailHost
      previews={items}
      listHref={listHref}
      initialDetailId={options.initialDetailId ?? ""}
    >
      {items.map((item) => (
        <ViewAbsenceButton
          key={item.id}
          absenceId={item.id}
          label={
            item.type === "SICKNESS"
              ? "View Sickness details"
              : item.type === "AWOL"
                ? "View AWOL details"
                : "View Cancellation details"
          }
        />
      ))}
    </LedgerDetailHost>,
  );
}

describe("ledger detail drawer", () => {
  it.each([
    {
      type: "SICKNESS" as const,
      id: "sick-1",
      label: "View Sickness details",
      known: "Jamie Cole",
      pending: "Loading Issue summary",
      page: "View full sickness page",
    },
    {
      type: "AWOL" as const,
      id: "awol-1",
      label: "View AWOL details",
      known: "North Gate",
      pending: "Loading Internal notes",
      page: "View full AWOL page",
    },
    {
      type: "CANCELLATION" as const,
      id: "cancel-1",
      label: "View Cancellation details",
      known: "Arena Night",
      pending: "Loading Reason",
      page: "View full cancellation page",
    },
  ])(
    "opens $type details before the absence request resolves",
    async ({ type, id, label, known, pending, page }) => {
      const pendingResult = deferred();
      loadDetail.mockReturnValue(pendingResult.promise);
      renderHost([
        preview({
          id,
          type,
          fullPageLabel: page,
          heading: type === "SICKNESS" ? "Ongoing" : type,
        }),
      ]);

      fireEvent.click(screen.getByRole("link", { name: label }));

      const dialog = await screen.findByRole("dialog");
      expect(dialog.textContent).toContain(known);
      expect(screen.getByRole("group", { name: pending })).toBeTruthy();
      expect(screen.getByRole("link", { name: page }).getAttribute("href")).toBe(
        `/absence/${id}`,
      );
      expect(loadDetail).toHaveBeenCalledWith(id);
      expect(window.location.search).toContain(`detail=${id}`);
      expect(dialog.textContent).not.toContain("Headache after the shift");
      expect(dialog.textContent).not.toContain("No call");
      expect(dialog.textContent).not.toContain("Late train");
    },
  );

  it("replaces skeletons when the absence detail loads", async () => {
    const cases = [
      {
        type: "SICKNESS" as const,
        id: "sick-1",
        label: "View Sickness details",
        page: "View full sickness page",
        pending: "Loading Issue summary",
        text: "Headache after the shift",
      },
      {
        type: "AWOL" as const,
        id: "awol-1",
        label: "View AWOL details",
        page: "View full AWOL page",
        pending: "Loading Internal notes",
        text: "No call",
      },
      {
        type: "CANCELLATION" as const,
        id: "cancel-1",
        label: "View Cancellation details",
        page: "View full cancellation page",
        pending: "Loading Reason",
        text: "Late train",
      },
    ];

    for (const item of cases) {
      cleanup();
      window.history.replaceState(null, "", "/");
      const pendingResult = deferred();
      loadDetail.mockReset();
      loadDetail.mockReturnValue(pendingResult.promise);
      renderHost([
        preview({
          id: item.id,
          type: item.type,
          fullPageLabel: item.page,
        }),
      ]);
      fireEvent.click(screen.getByRole("link", { name: item.label }));
      expect(await screen.findByRole("group", { name: item.pending })).toBeTruthy();
      pendingResult.resolve({
        ok: true,
        absence: absence(item.type, item.text),
        timeZone: "Europe/London",
        todayIso: "2026-09-14",
      });
      expect(await screen.findByText(item.text)).toBeTruthy();
      expect(screen.queryByRole("group", { name: item.pending })).toBeNull();
      cleanup();
    }
  });

  it("opens a shared detail url before the request resolves", async () => {
    const pendingResult = deferred();
    loadDetail.mockReturnValue(pendingResult.promise);
    renderHost(
      [preview({ id: "sick-1", type: "SICKNESS", fullPageLabel: "View full sickness page" })],
      { initialDetailId: "sick-1" },
    );
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Jamie Cole")).toBeTruthy();
    expect(screen.getByRole("group", { name: "Loading Issue summary" })).toBeTruthy();
    expect(loadDetail).toHaveBeenCalledWith("sick-1");
  });

  it("ignores a slower response after another absence is opened", async () => {
    const first = deferred();
    const second = deferred();
    loadDetail.mockImplementation((id: string) =>
      id === "sick-1" ? first.promise : second.promise,
    );
    renderHost([
      preview({
        id: "sick-1",
        type: "SICKNESS",
        fullPageLabel: "View full sickness page",
        staffName: "Jamie Cole",
      }),
      preview({
        id: "awol-1",
        type: "AWOL",
        fullPageLabel: "View full AWOL page",
        heading: "AWOL",
        staffName: "Alex Reed",
        fields: [{ label: "Event details", lines: ["North Gate"] }],
        pendingLabels: ["Internal notes"],
      }),
    ]);

    fireEvent.click(screen.getByRole("link", { name: "View Sickness details" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    fireEvent.click(screen.getByRole("link", { name: "View AWOL details" }));
    expect(await screen.findByText("Alex Reed")).toBeTruthy();
    first.resolve({
      ok: true,
      absence: absence("SICKNESS", "Headache after the shift"),
      todayIso: "2026-09-14",
    });
    await Promise.resolve();
    expect(screen.queryByText("Headache after the shift")).toBeNull();
    second.resolve({
      ok: true,
      absence: absence("AWOL", "No call"),
      todayIso: "2026-09-14",
    });
    expect(await screen.findByText("No call")).toBeTruthy();
  });
});
