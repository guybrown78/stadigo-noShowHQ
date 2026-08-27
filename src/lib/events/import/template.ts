import ExcelJS from "exceljs";
import {
  DEFAULT_CRITICAL_FILL_RATE,
  DEFAULT_WARNING_FILL_RATE,
  EVENT_STATUSES,
} from "@/lib/events/catalog";
import {
  EVENT_IMPORT_HEADERS,
  EVENTS_SHEET_NAME,
  INSTRUCTIONS_SHEET_NAME,
  MAX_IMPORT_DATA_ROWS,
  REFERENCE_SHEET_NAME,
} from "@/lib/events/import/constants";

export type TemplateType = {
  name: string;
  subtypes: { name: string }[];
};

export async function buildEventImportTemplate(
  types: TemplateType[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "NoShowHQ";
  workbook.created = new Date();

  const events = workbook.addWorksheet(EVENTS_SHEET_NAME, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const instructions = workbook.addWorksheet(INSTRUCTIONS_SHEET_NAME);
  const reference = workbook.addWorksheet(REFERENCE_SHEET_NAME);

  events.columns = EVENT_IMPORT_HEADERS.map((header) => ({
    header,
    width: Math.max(18, header.length + 4),
  }));
  const headerRow = events.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { wrapText: true, vertical: "middle" };
  events.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: EVENT_IMPORT_HEADERS.length },
  };

  const dateCol = EVENT_IMPORT_HEADERS.indexOf("Event Date") + 1;
  events.getColumn(dateCol).numFmt = "@";
  const lastDataRow = MAX_IMPORT_DATA_ROWS + 1;

  writeInstructions(instructions);
  const lists = writeReferenceData(reference, types);

  workbook.definedNames.add("TypeList", lists.typeRange);
  workbook.definedNames.add("SubtypeList", lists.subtypeRange);
  workbook.definedNames.add("StatusList", lists.statusRange);

  const typeCol = EVENT_IMPORT_HEADERS.indexOf("Event Type") + 1;
  const subtypeCol = EVENT_IMPORT_HEADERS.indexOf("Event Subtype") + 1;
  const statusCol = EVENT_IMPORT_HEADERS.indexOf("Status") + 1;
  const overnightCol = EVENT_IMPORT_HEADERS.indexOf("Overnight") + 1;

  addListValidation(events, typeCol, lastDataRow, "TypeList");
  addListValidation(events, subtypeCol, lastDataRow, "SubtypeList");
  addListValidation(events, statusCol, lastDataRow, "StatusList");
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

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function writeInstructions(sheet: ExcelJS.Worksheet) {
  sheet.columns = [
    { header: "Events import", width: 110 },
  ];
  sheet.getRow(1).font = { bold: true, size: 14 };
  const lines = [
    "",
    "How to import",
    "1. Keep the Events sheet headers exactly as they are. Do not rename, insert, or delete columns.",
    "2. Enter one event per row. Use event types and subtypes exactly as listed on the Reference Data sheet.",
    "3. Enter venue names consistently. The same spelling is treated as the same venue after trimming extra spaces and ignoring letter case.",
    "4. Upload the file in NoShowHQ. The system checks every row before anything is created.",
    "5. You must confirm venues in NoShowHQ. New venues are created first. Matched existing venues still need confirmation.",
    "6. No event is created until you confirm the final event preview.",
    "",
    "Required columns: Event Name, Event Type, Event Subtype, Venue Name, Event Date, Staff Required.",
    "Event Date must be an ISO date: YYYY-MM-DD (for example 2026-09-12). Do not use UK or US display formats.",
    "Times use 24-hour HH:mm (for example 14:30). If End Time is earlier than Start Time, set Overnight to Yes.",
    "Overnight is Yes or No. Leave blank for No.",
    "Staff Required is a whole number from 1 to 100,000.",
    `Warning and Critical Fill Rate % are optional whole numbers from 1 to 100. If blank, NoShowHQ uses ${DEFAULT_WARNING_FILL_RATE} and ${DEFAULT_CRITICAL_FILL_RATE}. Critical must be lower than warning.`,
    "Status is optional: PLANNED, CONFIRMED, CANCELLED, or COMPLETED. If blank, the event is created as PLANNED.",
    "Reference is optional. If supplied, it must be unique in this file and among active events for your organisation.",
    "Notes can be up to 2,000 characters.",
    "Venue Address Line 1, Town/City and Postcode are used only when a venue is new.",
    "",
    "Import creates new events only. It does not update existing events, calculate staffing risk, or create staff bookings.",
    "If any row needs correction, the whole file is rejected. Fix the rows and upload again. Valid rows are not imported on their own.",
    "",
    "Example",
    "Event Name: West Ham v Arsenal",
    "Event Type: Sporting",
    "Event Subtype: Football Match",
    "Venue Name: London Stadium",
    "Event Date: 2026-09-12",
    "Start Time: 15:00",
    "End Time: 17:00",
    "Staff Required: 40",
    "Status: PLANNED",
  ];
  lines.forEach((line, index) => {
    const row = sheet.getRow(index + 2);
    row.getCell(1).value = line;
    if (line && !line.includes(":") && line.length < 40) {
      row.font = { bold: true };
    }
  });
}

function writeReferenceData(
  sheet: ExcelJS.Worksheet,
  types: TemplateType[],
): { typeRange: string; subtypeRange: string; statusRange: string } {
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

  const typeEnd = Math.max(2, typeNames.length + 1);
  const subtypeEnd = Math.max(2, subtypeRows.length + 1);
  const statusEnd = Math.max(2, EVENT_STATUSES.length + 1);
  const quoted = `'${REFERENCE_SHEET_NAME}'`;
  return {
    typeRange: `${quoted}!$A$2:$A$${typeEnd}`,
    subtypeRange: `${quoted}!$C$2:$C$${subtypeEnd}`,
    statusRange: `${quoted}!$E$2:$E$${statusEnd}`,
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
  namedRange: string,
) {
  addDataValidation(sheet, `${colLetter(column)}2:${colLetter(column)}${lastRow}`, {
    type: "list",
    allowBlank: true,
    formulae: [namedRange],
    showErrorMessage: true,
    errorTitle: "Choose a listed value",
    error: "Use a value from the Reference Data sheet.",
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
