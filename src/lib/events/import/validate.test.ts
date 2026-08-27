import { describe, expect, it } from "vitest";
import { EVENT_IMPORT_HEADERS } from "@/lib/events/import/constants";
import { parseImportFile } from "@/lib/events/import/parse";
import { validateImportRows } from "@/lib/events/import/validate";
import type { ImportRowRaw } from "@/lib/events/import/types";

function csvFromRows(rows: Array<Partial<ImportRowRaw>>): Uint8Array {
  const lines = [
    EVENT_IMPORT_HEADERS.join(","),
    ...rows.map((row) =>
      EVENT_IMPORT_HEADERS.map((header) => csvEscape(row[header] ?? "")).join(
        ",",
      ),
    ),
  ];
  return new TextEncoder().encode(lines.join("\n"));
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

const types = [
  {
    id: "type-sporting",
    name: "Sporting",
    code: "sporting",
    subtypes: [
      {
        id: "sub-football",
        name: "Football Match",
        code: "football-match",
      },
    ],
  },
];

const validRow: Partial<ImportRowRaw> = {
  "Event Name": "West Ham v Arsenal",
  "Event Type": "Sporting",
  "Event Subtype": "Football Match",
  "Venue Name": "London Stadium",
  "Event Date": "2026-09-12",
  "Staff Required": "40",
};

describe("import parse", () => {
  it("rejects files whose headers do not match the template", async () => {
    const bytes = new TextEncoder().encode("Name,Date\nTest,2026-09-12\n");
    const parsed = await parseImportFile("events.csv", bytes);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error).toMatch(/headers/i);
    }
  });

  it("keeps empty rows in the middle and trims trailing empty rows", async () => {
    const bytes = csvFromRows([
      {},
      validRow,
      {},
      { ...validRow, "Event Name": "Second event" },
      {},
    ]);
    const parsed = await parseImportFile("events.csv", bytes);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rows).toHaveLength(4);
    expect(parsed.rows[0]?.empty).toBe(true);
    expect(parsed.rows[1]?.empty).toBe(false);
    expect(parsed.rows[2]?.empty).toBe(true);
    expect(parsed.rows[3]?.empty).toBe(false);
  });
});

describe("import validation", () => {
  it("accepts a valid row and treats a new venue as new", async () => {
    const bytes = csvFromRows([validRow]);
    const parsed = await parseImportFile("events.csv", bytes);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = validateImportRows(parsed.rows, {
      types,
      existingEvents: [],
      existingVenues: [],
    });
    expect(result.hasBlockingErrors).toBe(false);
    expect(result.validRows).toBe(1);
    expect(result.newVenueCount).toBe(1);
    expect(result.venues[0]?.outcome).toBe("NEW");
  });

  it("matches venue names after trimming and ignoring case", async () => {
    const bytes = csvFromRows([{ ...validRow, "Venue Name": "  LONDON   stadium " }]);
    const parsed = await parseImportFile("events.csv", bytes);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = validateImportRows(parsed.rows, {
      types,
      existingEvents: [],
      existingVenues: [
        {
          id: "venue-1",
          name: "London Stadium",
          nameNormalized: "london stadium",
          addressLine1: "Queen Elizabeth Olympic Park",
          townCity: "London",
          postcode: "E20 2ST",
          active: true,
        },
      ],
    });
    expect(result.hasBlockingErrors).toBe(false);
    expect(result.matchedVenueCount).toBe(1);
    expect(result.venues[0]?.outcome).toBe("MATCHED");
    expect(result.venues[0]?.matchedVenueId).toBe("venue-1");
  });

  it("blocks the whole file when one row is invalid", async () => {
    const bytes = csvFromRows([
      validRow,
      { ...validRow, "Event Name": "A", "Event Date": "12/09/2026" },
    ]);
    const parsed = await parseImportFile("events.csv", bytes);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = validateImportRows(parsed.rows, {
      types,
      existingEvents: [],
      existingVenues: [],
    });
    expect(result.hasBlockingErrors).toBe(true);
    expect(result.invalidRows).toBe(1);
    expect(result.validRows).toBe(1);
  });

  it("treats a duplicate reference in the file as a blocking error", async () => {
    const bytes = csvFromRows([
      { ...validRow, Reference: "WHU-1" },
      { ...validRow, "Event Name": "Other", Reference: "WHU-1" },
    ]);
    const parsed = await parseImportFile("events.csv", bytes);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = validateImportRows(parsed.rows, {
      types,
      existingEvents: [],
      existingVenues: [],
    });
    expect(result.hasBlockingErrors).toBe(true);
    expect(
      result.rows.filter((row) => row.fieldErrors.reference).length,
    ).toBe(2);
  });

  it("treats a potential duplicate without a reference as a blocking error", async () => {
    const bytes = csvFromRows([validRow]);
    const parsed = await parseImportFile("events.csv", bytes);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = validateImportRows(parsed.rows, {
      types,
      existingEvents: [
        {
          id: "evt-1",
          name: "West Ham v Arsenal",
          reference: null,
          eventDate: new Date(Date.UTC(2026, 8, 12)),
          venueId: "venue-1",
          venueNameNormalized: "london stadium",
        },
      ],
      existingVenues: [
        {
          id: "venue-1",
          name: "London Stadium",
          nameNormalized: "london stadium",
          addressLine1: null,
          townCity: null,
          postcode: null,
          active: true,
        },
      ],
    });
    expect(result.hasBlockingErrors).toBe(true);
    expect(result.rows[0]?.fieldErrors.name?.[0]).toMatch(/already exists/i);
  });
});
