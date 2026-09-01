import { describe, expect, it } from "vitest";
import { cellToDisplayString } from "@/lib/events/import/cells";

describe("cellToDisplayString", () => {
  it("reads a plain string", () => {
    expect(cellToDisplayString("lauren.mills@example.com")).toBe(
      "lauren.mills@example.com",
    );
  });

  it("reads a mailto hyperlink whose display text is nested rich text", () => {
    expect(
      cellToDisplayString({
        text: {
          richText: [
            {
              font: { underline: "single" },
              text: "lauren.mills@example.com",
            },
          ],
        },
        hyperlink: "mailto:lauren.mills@example.com",
      }),
    ).toBe("lauren.mills@example.com");
  });

  it("falls back to the mailto target when display text is missing", () => {
    expect(
      cellToDisplayString({
        hyperlink: "mailto:daniel.hughes@example.com",
      }),
    ).toBe("daniel.hughes@example.com");
  });

  it("does not stringify leftover objects as [object Object]", () => {
    expect(cellToDisplayString({ unexpected: true })).toBe("");
  });
});
