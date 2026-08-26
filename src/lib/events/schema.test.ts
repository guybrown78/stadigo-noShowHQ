import { describe, expect, it } from "vitest";
import { eventInputSchema, venueInputSchema } from "@/lib/events/schema";
import { normalizeUkPostcode, normalizeVenueNameKey } from "@/lib/events/normalize";
import { minuteOptions, parseLocalDate, resolveOvernight } from "@/lib/events/dates";

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    name: "West Ham v Arsenal",
    reference: "WHU-001",
    eventTypeId: "type-1",
    eventSubtypeId: "subtype-1",
    venueId: "venue-1",
    newVenueName: "",
    newVenueAddressLine1: "",
    newVenueTownCity: "",
    newVenuePostcode: "",
    eventDate: "2026-08-29",
    briefingTime: "12:00",
    startTime: "14:00",
    endTime: "17:00",
    staffRequired: "40",
    warningFillRate: "90",
    criticalFillRate: "85",
    status: "PLANNED",
    notes: "",
    ...overrides,
  };
}

describe("eventInputSchema", () => {
  it("accepts a complete valid event", () => {
    const parsed = eventInputSchema.safeParse(validInput());
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.staffRequired).toBe(40);
      expect(parsed.data.warningFillRate).toBe(90);
      expect(parsed.data.criticalFillRate).toBe(85);
      expect(parsed.data.reference).toBe("WHU-001");
    }
  });

  it("rejects a name that is too short after trimming", () => {
    const parsed = eventInputSchema.safeParse(validInput({ name: " A " }));
    expect(parsed.success).toBe(false);
  });

  it("requires a venue or a new venue name", () => {
    const parsed = eventInputSchema.safeParse(
      validInput({ venueId: "", newVenueName: "  " }),
    );
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const paths = parsed.error.issues.map((issue) => issue.path.join("."));
      expect(paths).toContain("venueId");
    }
  });

  it("rejects a critical fill rate that is not lower than warning", () => {
    const parsed = eventInputSchema.safeParse(
      validInput({ warningFillRate: "80", criticalFillRate: "80" }),
    );
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const paths = parsed.error.issues.map((issue) => issue.path.join("."));
      expect(paths).toContain("criticalFillRate");
    }
  });

  it("rejects a briefing time that is not earlier than start time", () => {
    const parsed = eventInputSchema.safeParse(
      validInput({ briefingTime: "15:00", startTime: "15:00" }),
    );
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const paths = parsed.error.issues.map((issue) => issue.path.join("."));
      expect(paths).toContain("briefingTime");
    }
  });

  it("rejects an end time that is not later than start time", () => {
    const parsed = eventInputSchema.safeParse(
      validInput({ startTime: "15:00", endTime: "14:00" }),
    );
    expect(parsed.success).toBe(false);
  });

  it("accepts overnight events when endsNextDay is set", () => {
    const parsed = eventInputSchema.safeParse(
      validInput({
        startTime: "22:00",
        endTime: "02:00",
        endsNextDay: true,
        briefingTime: "21:00",
      }),
    );
    expect(parsed.success).toBe(true);
  });

  it("rejects equal start and end times", () => {
    const parsed = eventInputSchema.safeParse(
      validInput({ startTime: "18:00", endTime: "18:00" }),
    );
    expect(parsed.success).toBe(false);
  });

  it("rejects notes over 2000 characters", () => {
    const parsed = eventInputSchema.safeParse(
      validInput({ notes: "x".repeat(2001) }),
    );
    expect(parsed.success).toBe(false);
  });

  it("accepts a new venue with optional address fields", () => {
    const parsed = eventInputSchema.safeParse(
      validInput({
        venueId: "",
        newVenueName: "Emirates Stadium",
        newVenueAddressLine1: "Hornsey Road",
        newVenueTownCity: "London",
        newVenuePostcode: "n57ay",
      }),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.newVenueName).toBe("Emirates Stadium");
      expect(parsed.data.newVenuePostcode).toBe("N5 7AY");
    }
  });

  it("treats a blank reference as absent", () => {
    const parsed = eventInputSchema.safeParse(validInput({ reference: "   " }));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.reference).toBeNull();
    }
  });
});

describe("event dates and venues", () => {
  it("parses a calendar date without shifting the day", () => {
    expect(parseLocalDate("2026-08-29")?.toISOString()).toBe(
      "2026-08-29T00:00:00.000Z",
    );
    expect(parseLocalDate("2026-02-31")).toBeNull();
  });

  it("marks overnight when the end time is earlier than start", () => {
    expect(resolveOvernight("22:00", "02:00")).toEqual({
      endsNextDay: true,
      valid: true,
    });
    expect(resolveOvernight("14:00", "17:00")).toEqual({
      endsNextDay: false,
      valid: true,
    });
  });

  it("normalises UK postcodes and venue names", () => {
    expect(normalizeUkPostcode("e202st")).toBe("E20 2ST");
    expect(normalizeVenueNameKey("  West Ham  ")).toBe("west ham");
  });

  it("offers minutes in 5-minute steps and keeps an existing off-grid value", () => {
    expect(minuteOptions()).toEqual([
      "00",
      "05",
      "10",
      "15",
      "20",
      "25",
      "30",
      "35",
      "40",
      "45",
      "50",
      "55",
    ]);
    expect(minuteOptions("14:07")).toContain("07");
  });
});

describe("venueInputSchema", () => {
  it("accepts a named venue with optional address", () => {
    const parsed = venueInputSchema.safeParse({
      name: "  Wembley Stadium  ",
      addressLine1: "Olympic Way",
      townCity: "Wembley",
      postcode: "ha90ws",
      active: true,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.name).toBe("Wembley Stadium");
      expect(parsed.data.postcode).toBe("HA9 0WS");
    }
  });

  it("rejects a venue name that is too short", () => {
    const parsed = venueInputSchema.safeParse({
      name: "A",
      addressLine1: "",
      townCity: "",
      postcode: "",
      active: true,
    });
    expect(parsed.success).toBe(false);
  });
});
