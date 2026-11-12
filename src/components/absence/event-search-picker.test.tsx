import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/absence/actions", () => ({
  searchAbsenceEventsAction: vi.fn(async () => []),
}));
import type { AbsenceEventOption } from "@/lib/absence/queries";
import {
  firstSelectableIndex,
  partitionSearchResults,
  stepSelectableIndex,
} from "@/components/absence/event-search-picker";

const taken: AbsenceEventOption = {
  id: "taken",
  name: "London Street Food Festival",
  reference: null,
  eventDate: "2026-10-25",
  briefingTime: null,
  startTime: null,
  endTime: null,
  venueName: "Gtech Community Stadium",
  eventTypeName: "Festival",
  eventSubtypeName: "Food",
};

const free: AbsenceEventOption = {
  ...taken,
  id: "free",
  name: "Riverside Sounds Festival",
  eventDate: "2026-10-24",
};

describe("event search already on this sickness", () => {
  it("lands on the first shift that can still be added", () => {
    expect(firstSelectableIndex([taken, free], new Set(["taken"]))).toBe(1);
    expect(firstSelectableIndex([free, taken], new Set(["taken"]))).toBe(0);
  });

  it("puts shifts that can be added before ones already on this sickness", () => {
    const grouped = partitionSearchResults([taken, free], new Set(["taken"]));
    expect(grouped.available.map((item) => item.event.id)).toEqual(["free"]);
    expect(grouped.taken.map((item) => item.event.id)).toEqual(["taken"]);
  });

  it("skips a shift that is already on this sickness when moving through the list", () => {
    const results = [free, taken, { ...free, id: "later", name: "Later" }];
    const unavailable = new Set(["taken"]);
    expect(stepSelectableIndex(results, 0, 1, unavailable)).toBe(2);
    expect(stepSelectableIndex(results, 2, -1, unavailable)).toBe(0);
  });
});
