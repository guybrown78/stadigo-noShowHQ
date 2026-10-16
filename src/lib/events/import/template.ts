import ExcelJS from "exceljs";
import {
  DEFAULT_CRITICAL_FILL_RATE,
  DEFAULT_WARNING_FILL_RATE,
  EVENT_STATUSES,
} from "@/lib/events/catalog";
import {
  EVENT_IMPORT_HEADERS,
  EVENT_IMPORT_REQUIRED_HEADERS,
  EVENTS_SHEET_NAME,
  INSTRUCTIONS_SHEET_NAME,
  MAX_IMPORT_DATA_ROWS,
  REFERENCE_SHEET_NAME,
  VENUES_SHEET_NAME,
  type EventImportHeader,
  type EventImportTemplateVariant,
} from "@/lib/events/import/constants";

export type TemplateType = {
  name: string;
  subtypes: { name: string }[];
};

export type TemplateVenue = {
  identifier: string;
  name: string;
  code: string | null;
};

export async function buildEventImportTemplate(
  types: TemplateType[],
  variant: EventImportTemplateVariant = "full",
  venues: TemplateVenue[] = [],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "NoShowHQ";
  workbook.created = new Date();

  const headers: readonly EventImportHeader[] =
    variant === "minimum" ? EVENT_IMPORT_REQUIRED_HEADERS : EVENT_IMPORT_HEADERS;

  const events = workbook.addWorksheet(EVENTS_SHEET_NAME, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const venueSheet = workbook.addWorksheet(VENUES_SHEET_NAME);
  const instructions = workbook.addWorksheet(INSTRUCTIONS_SHEET_NAME);
  const reference = workbook.addWorksheet(REFERENCE_SHEET_NAME);

  events.columns = headers.map((header) => ({
    header,
    width: Math.max(18, header.length + 4),
  }));
  const headerRow = events.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { wrapText: true, vertical: "middle" };
  events.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: headers.length },
  };

  const dateCol = headers.indexOf("Event Date") + 1;
  events.getColumn(dateCol).numFmt = "dd/mm/yyyy";
  const lastDataRow = MAX_IMPORT_DATA_ROWS + 1;

  writeVenueSheet(venueSheet, venues);
  writeInstructions(instructions, variant);
  const lists = writeReferenceData(reference, types);

  const venueCol = headers.indexOf("Venue Name") + 1;
  const typeCol = headers.indexOf("Event Type") + 1;
  const subtypeCol = headers.indexOf("Event Subtype") + 1;
  const statusCol = headers.indexOf("Status") + 1;
  const overnightCol = headers.indexOf("Overnight") + 1;

  if (venues.length > 0) {
    const venueList = `'${VENUES_SHEET_NAME}'!$B$2:$B$${venues.length + 1}`;
    addDataValidation(
      events,
      `${colLetter(venueCol)}2:${colLetter(venueCol)}${lastDataRow}`,
      {
        type: "list",
        allowBlank: true,
        formulae: [venueList],
        showErrorMessage: false,
      },
    );
  }
  if (lists.typeCount > 0) {
    addListValidation(
      events,
      typeCol,
      lastDataRow,
      lists.typeRange,
      "Choose an event type from the Reference Data sheet.",
    );
  }
  if (lists.subtypeCount > 0) {
    addListValidation(
      events,
      subtypeCol,
      lastDataRow,
      lists.subtypeRange,
      "Choose an event subtype from the Reference Data sheet. It must belong to the event type on the same row.",
    );
  }
  if (statusCol > 0) {
    addListValidation(
      events,
      statusCol,
      lastDataRow,
      lists.statusRange,
      "Choose a status from the Reference Data sheet, or leave the cell blank for PLANNED.",
    );
  }
  if (overnightCol > 0) {
    addDataValidation(
      events,
      `${colLetter(overnightCol)}2:${colLetter(overnightCol)}${lastDataRow}`,
      {
        type: "list",
        allowBlank: true,
        formulae: ['"Yes,No"'],
        showErrorMessage: true,
        errorTitle: "Overnight",
        error: "Enter Yes or No. Leave blank for No.",
      },
    );
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function writeInstructions(
  sheet: ExcelJS.Worksheet,
  variant: EventImportTemplateVariant,
) {
  sheet.columns = [
    { header: "Events import", width: 110 },
  ];
  sheet.getRow(1).font = { bold: true, size: 14 };
  const lines = [
    "",
    variant === "minimum" ? "Minimum template" : "Full template",
    "How to import",
    "1. Do not rename the header row. Optional columns may be left blank, or left out by using the minimum template.",
    "2. Enter one event per row. Event Type and Event Subtype have dropdowns of this organisation’s lists. The same lists are on the Reference Data sheet, with the event type each subtype belongs to.",
    "3. Venue Name has a dropdown of saved venue names. You can also type a Venue ID such as VEN-1, the venue name, or the optional venue code. A new venue name is allowed. The Venues sheet lists the ID, name, and code.",
    "4. Upload the file in NoShowHQ. The system checks every row before anything is created.",
    "5. You must confirm venues in NoShowHQ. New venues are created first. Matched existing venues still need confirmation.",
    "6. No event is created until you confirm the final event preview.",
    "",
    "Required columns: Event Name, Event Type, Event Subtype, Venue Name, Event Date.",
    "Event Date is a calendar date in DD/MM/YYYY, for example 12/09/2026. Pick it from the date picker, or type it. YYYY-MM-DD is also accepted.",
    "Briefing Time, Start Time, and End Time are optional. Times use 24-hour HH:mm (for example 14:30). If End Time is earlier than Start Time, set Overnight to Yes.",
    "Overnight is optional. Yes or No. Leave blank for No.",
    "Staff Required is optional. Leave it blank when the number is not known yet. If you enter it, use a whole number from 1 to 100,000.",
    `Warning and Critical Fill Rate % are optional whole numbers from 1 to 100. If blank, NoShowHQ uses ${DEFAULT_WARNING_FILL_RATE} and ${DEFAULT_CRITICAL_FILL_RATE}. Critical must be lower than warning.`,
    "Status is optional: PLANNED, CONFIRMED, CANCELLED, POSTPONED, or COMPLETED. If blank, the event is created as PLANNED.",
    "Reference is optional. If supplied, it must be unique in this file and among active events for your organisation.",
    "Notes can be up to 2,000 characters.",
    "Venue Address Line 1, Town/City and Postcode are optional. They are used only when a venue is new.",
    "",
    "Import creates new events only. It does not update existing events, calculate staffing risk, or create staff bookings.",
    "If any row needs correction, the whole file is rejected. Fix the rows and upload again. Valid rows are not imported on their own.",
    "",
    "Example that passes with only the required columns",
    "Event Name: Sample match",
    "Event Type: Sporting",
    "Event Subtype: Football Match",
    "Venue Name: Sample Stadium",
    "Event Date: 12/09/2026",
    "Leave Briefing Time, Start Time, End Time, and Staff Required blank until you know them.",
  ];
  lines.forEach((line, index) => {
    const row = sheet.getRow(index + 2);
    row.getCell(1).value = line;
    if (line && !line.includes(":") && line.length < 40) {
      row.font = { bold: true };
    }
  });
}

function writeVenueSheet(sheet: ExcelJS.Worksheet, venues: TemplateVenue[]) {
  sheet.columns = [
    { header: "Venue ID", width: 16 },
    { header: "Venue name", width: 36 },
    { header: "Venue code", width: 16 },
    { header: "How to use this list", width: 88 },
  ];
  sheet.getRow(1).font = { bold: true };
  if (venues.length === 0) {
    sheet.getCell(2, 4).value =
      "No venues are saved for this organisation yet. Type a new venue name on the Events sheet.";
    return;
  }
  sheet.getCell(2, 4).value =
    "In Venue Name on the Events sheet, enter the Venue ID, the venue name, or the venue code. You can also type a new venue. Excel shows the names in a dropdown. Numbers does not, so copy from this sheet.";
  venues.forEach((venue, index) => {
    sheet.getCell(index + 2, 1).value = venue.identifier;
    sheet.getCell(index + 2, 2).value = venue.name;
    sheet.getCell(index + 2, 3).value = venue.code ?? "";
  });
}

function writeReferenceData(
  sheet: ExcelJS.Worksheet,
  types: TemplateType[],
): {
  typeRange: string;
  subtypeRange: string;
  statusRange: string;
  typeCount: number;
  subtypeCount: number;
} {
  sheet.columns = [
    { header: "Event types", width: 32 },
    { header: "", width: 4 },
    { header: "Event subtypes", width: 36 },
    { header: "For event type", width: 32 },
    { header: "Statuses", width: 16 },
    { header: "", width: 4 },
    { header: "Notes", width: 60 },
  ];
  sheet.getRow(1).font = { bold: true };

  const typeNames = types.map((type) => type.name);
  const subtypeRows: { subtype: string; type: string }[] = [];
  for (const type of types) {
    for (const subtype of type.subtypes) {
      subtypeRows.push({ subtype: subtype.name, type: type.name });
    }
  }

  typeNames.forEach((name, index) => {
    sheet.getCell(index + 2, 1).value = name;
  });
  subtypeRows.forEach((row, index) => {
    sheet.getCell(index + 2, 3).value = row.subtype;
    sheet.getCell(index + 2, 4).value = row.type;
  });
  EVENT_STATUSES.forEach((status, index) => {
    sheet.getCell(index + 2, 5).value = status;
  });

  sheet.getCell(2, 7).value =
    "Use these values on the Events sheet. The server rechecks every value on upload.";
  sheet.getCell(3, 7).value =
    "Subtype must belong to the Event Type on the same row.";
  sheet.getCell(4, 7).value = `Fill rate defaults: warning ${DEFAULT_WARNING_FILL_RATE}, critical ${DEFAULT_CRITICAL_FILL_RATE}.`;
  sheet.getCell(5, 7).value =
    "This organisation’s venues are on the Venues sheet.";

  const typeEnd = Math.max(2, typeNames.length + 1);
  const subtypeEnd = Math.max(2, subtypeRows.length + 1);
  const statusEnd = Math.max(2, EVENT_STATUSES.length + 1);
  const quoted = `'${REFERENCE_SHEET_NAME}'`;
  return {
    typeRange: `${quoted}!$A$2:$A$${typeEnd}`,
    subtypeRange: `${quoted}!$C$2:$C$${subtypeEnd}`,
    statusRange: `${quoted}!$E$2:$E$${statusEnd}`,
    typeCount: typeNames.length,
    subtypeCount: subtypeRows.length,
  };
}

type WorksheetWithValidations = ExcelJS.Worksheet & {
  dataValidations: {
    add: (range: string, validation: ExcelJS.DataValidation) => void;
  };
};

function addListValidation(
  sheet: ExcelJS.Worksheet,
  column: number,
  lastRow: number,
  range: string,
  error: string,
) {
  addDataValidation(sheet, `${colLetter(column)}2:${colLetter(column)}${lastRow}`, {
    type: "list",
    allowBlank: true,
    formulae: [range],
    showErrorMessage: false,
    errorTitle: "Choose a listed value",
    error,
  });
}

function addDataValidation(
  sheet: ExcelJS.Worksheet,
  range: string,
  validation: ExcelJS.DataValidation,
) {
  (sheet as WorksheetWithValidations).dataValidations.add(range, validation);
}

function colLetter(column: number): string {
  let n = column;
  let letter = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}
