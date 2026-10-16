import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { EVENT_IMPORT_HEADERS, EVENT_IMPORT_REQUIRED_HEADERS } from "@/lib/events/import/constants";
import { parseImportFile } from "@/lib/events/import/parse";
import { buildEventImportTemplate } from "@/lib/events/import/template";
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

  it("accepts a file that only has the required headers", async () => {
    const bytes = new TextEncoder().encode(
      [
        EVENT_IMPORT_REQUIRED_HEADERS.join(","),
        "Sample match,Sporting,Football Match,Sample Stadium,2026-09-12",
      ].join("\n"),
    );
    const parsed = await parseImportFile("events.csv", bytes);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = validateImportRows(parsed.rows, {
      types,
      existingEvents: [],
      existingVenues: [],
    });
    expect(result.hasBlockingErrors).toBe(false);
    expect(result.rows[0]?.normalized?.staffRequired).toBeNull();
    expect(result.rows[0]?.normalized?.status).toBe("PLANNED");
    expect(result.rows[0]?.normalized?.briefingTime).toBeNull();
  });

  it("rejects a file that is missing a required header", async () => {
    const bytes = new TextEncoder().encode(
      "Event Type,Event Subtype,Venue Name,Event Date\nSporting,Football Match,Sample Stadium,2026-09-12\n",
    );
    const parsed = await parseImportFile("events.csv", bytes);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error).toMatch(/Event Name/);
    }
  });

  it("rejects an unknown header", async () => {
    const bytes = new TextEncoder().encode(
      `${EVENT_IMPORT_REQUIRED_HEADERS.join(",")},Home Club\nSample match,Sporting,Football Match,Sample Stadium,2026-09-12,Riverside\n`,
    );
    const parsed = await parseImportFile("events.csv", bytes);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error).toMatch(/Unknown: Home Club/);
    }
  });

  it("lists this organisation’s venues on their own sheet", async () => {
    const buffer = await buildEventImportTemplate(
      types.map((type) => ({
        name: type.name,
        subtypes: type.subtypes.map((subtype) => ({ name: subtype.name })),
      })),
      "full",
      [
        { identifier: "VEN-1", name: "London Stadium", code: "LST" },
        { identifier: "VEN-2", name: "Sample Ground", code: null },
      ],
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(buffer) as unknown as ArrayBuffer);
    const venues = workbook.getWorksheet("Venues");
    expect(venues?.getCell("A2").value).toBe("VEN-1");
    expect(venues?.getCell("B2").value).toBe("London Stadium");
    expect(venues?.getCell("C2").value).toBe("LST");
    expect(venues?.getCell("A3").value).toBe("VEN-2");
    expect(venues?.getCell("B3").value).toBe("Sample Ground");
    expect(workbook.getWorksheet("Events")?.getCell("A2").value).toBeNull();
    const venueCell = workbook.getWorksheet("Events")?.getCell("E2");
    expect(String(venueCell?.dataValidation?.formulae?.[0])).toBe(
      "'Venues'!$B$2:$B$3",
    );
    const events = workbook.getWorksheet("Events");
    expect(String(events?.getCell("C2").dataValidation?.formulae?.[0])).toBe(
      "'Reference Data'!$A$2:$A$2",
    );
    expect(String(events?.getCell("D2").dataValidation?.formulae?.[0])).toBe(
      "'Reference Data'!$C$2:$C$2",
    );
    expect(events?.getColumn(9).numFmt).toBe("dd/mm/yyyy");
  });

  it("parses a minimum workbook with no data rows", async () => {
    const buffer = await buildEventImportTemplate(
      types.map((type) => ({
        name: type.name,
        subtypes: type.subtypes.map((subtype) => ({ name: subtype.name })),
      })),
      "minimum",
    );
    const parsed = await parseImportFile(
      "noshowhq-events-import-minimum.xlsx",
      new Uint8Array(buffer),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rows.every((row) => row.empty)).toBe(true);
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

  it("accepts a blank staff required and rejects zero or text", async () => {
    const blank = csvFromRows([
      {
        ...validRow,
        "Staff Required": "",
        "Briefing Time": "",
        "Start Time": "",
        "End Time": "",
      },
    ]);
    const blankParsed = await parseImportFile("events.csv", blank);
    expect(blankParsed.ok).toBe(true);
    if (!blankParsed.ok) return;
    const blankResult = validateImportRows(blankParsed.rows, {
      types,
      existingEvents: [],
      existingVenues: [],
    });
    expect(blankResult.hasBlockingErrors).toBe(false);
    expect(blankResult.rows[0]?.normalized?.staffRequired).toBeNull();

    for (const staffRequired of ["0", "abc"]) {
      const bytes = csvFromRows([{ ...validRow, "Staff Required": staffRequired }]);
      const parsed = await parseImportFile("events.csv", bytes);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      const result = validateImportRows(parsed.rows, {
        types,
        existingEvents: [],
        existingVenues: [],
      });
      expect(result.hasBlockingErrors).toBe(true);
      expect(result.rows[0]?.fieldErrors.staffRequired?.length).toBeGreaterThan(0);
    }
  });

  it("matches a venue code to that organisation’s venue", async () => {
    const bytes = csvFromRows([{ ...validRow, "Venue Name": "lst" }]);
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
          identifier: "VEN-4",
          code: "LST",
          addressLine1: null,
          townCity: "London",
          postcode: "E20 2ST",
          active: true,
        },
      ],
    });
    expect(result.hasBlockingErrors).toBe(false);
    expect(result.matchedVenueCount).toBe(1);
    expect(result.newVenueCount).toBe(0);
    expect(result.venues[0]?.matchedVenueId).toBe("venue-1");
    expect(result.rows[0]?.normalized?.venueName).toBe("London Stadium");
  });

  it("matches a venue ID to that organisation’s venue", async () => {
    const bytes = csvFromRows([{ ...validRow, "Venue Name": "ven-4" }]);
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
          identifier: "VEN-4",
          code: "LST",
          addressLine1: null,
          townCity: "London",
          postcode: "E20 2ST",
          active: true,
        },
      ],
    });
    expect(result.hasBlockingErrors).toBe(false);
    expect(result.venues[0]?.matchedVenueId).toBe("venue-1");
    expect(result.rows[0]?.normalized?.venueName).toBe("London Stadium");
  });

  it("accepts a UK day-month-year event date", async () => {
    const bytes = csvFromRows([
      { ...validRow, "Event Date": "12/09/2026" },
      { ...validRow, "Event Name": "Other", "Event Date": "5-6-2026" },
    ]);
    const parsed = await parseImportFile("events.csv", bytes);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = validateImportRows(parsed.rows, {
      types,
      existingEvents: [],
      existingVenues: [],
    });
    expect(result.hasBlockingErrors).toBe(false);
    expect(result.rows[0]?.normalized?.eventDate).toBe("2026-09-12");
    expect(result.rows[1]?.normalized?.eventDate).toBe("2026-06-05");
  });

  it("blocks the whole file when one row is invalid", async () => {
    const bytes = csvFromRows([
      validRow,
      { ...validRow, "Event Name": "A", "Event Date": "not-a-date" },
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
