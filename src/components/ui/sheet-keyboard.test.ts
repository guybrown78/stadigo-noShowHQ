import { describe, expect, it } from "vitest";
import {
  sheetHasNestedDialog,
  sheetMotionMs,
  SHEET_ENTER_MS,
  SHEET_EXIT_MS,
  sheetTabWrapTarget,
} from "@/components/ui/sheet-keyboard";

describe("sheet keyboard", () => {
  it("wraps Tab at the first and last focusable control", () => {
    expect(sheetTabWrapTarget(false, false, true)).toBe("first");
    expect(sheetTabWrapTarget(true, true, false)).toBe("last");
    expect(sheetTabWrapTarget(false, true, false)).toBeNull();
    expect(sheetTabWrapTarget(true, false, true)).toBeNull();
  });

  it("defers to an open nested dialog instead of closing the sheet", () => {
    const root = {
      querySelector: (selector: string) =>
        selector === "dialog[open]" ? {} : null,
    };
    expect(sheetHasNestedDialog(root as unknown as ParentNode)).toBe(true);
    expect(
      sheetHasNestedDialog({
        querySelector: () => null,
      } as unknown as ParentNode),
    ).toBe(false);
    expect(sheetHasNestedDialog(null)).toBe(false);
  });

  it("drops motion when the user prefers reduced motion", () => {
    expect(sheetMotionMs(false)).toBe(SHEET_EXIT_MS);
    expect(sheetMotionMs(false, SHEET_ENTER_MS)).toBe(SHEET_ENTER_MS);
    expect(sheetMotionMs(true)).toBe(0);
    expect(sheetMotionMs(true, SHEET_ENTER_MS)).toBe(0);
  });
});
