import { describe, expect, it } from "vitest";
import { pageScrollShiftPx } from "@/components/ui/page-scroll-lock";

describe("pageScrollShiftPx", () => {
  it("reserves the width the disappearing scrollbar would have released", () => {
    expect(pageScrollShiftPx(1425, 1440)).toBe(15);
    expect(pageScrollShiftPx(1440, 1440)).toBe(0);
    expect(pageScrollShiftPx(1440, 1425)).toBe(0);
  });
});
