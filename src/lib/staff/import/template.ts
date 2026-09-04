import ExcelJS from "exceljs";
import {
  EMPLOYMENT_STATUSES,
  MAX_PROBATION_DAYS,
  SECURITY_CLEARANCE_STATUSES,
} from "@/lib/staff/catalog";
import {
  INSTRUCTIONS_SHEET_NAME,
  MAX_IMPORT_DATA_ROWS,
  REFERENCE_SHEET_NAME,
  STAFF_IMPORT_DATE_HEADERS,
  STAFF_IMPORT_HEADERS,
  STAFF_SHEET_NAME,
} from "@/lib/staff/import/constants";

export async function buildStaffImportTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "NoShowHQ";
  workbook.created = new Date();

  const staff = workbook.addWorksheet(STAFF_SHEET_NAME, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const instructions = workbook.addWorksheet(INSTRUCTIONS_SHEET_NAME);
  const reference = workbook.addWorksheet(REFERENCE_SHEET_NAME);

  staff.columns = STAFF_IMPORT_HEADERS.map((header) => ({
    header,
    width: Math.max(18, header.length + 4),
  }));
  const headerRow = staff.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { wrapText: true, vertical: "middle" };
  staff.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: STAFF_IMPORT_HEADERS.length },
  };

  for (const header of STAFF_IMPORT_DATE_HEADERS) {
    const col = STAFF_IMPORT_HEADERS.indexOf(header) + 1;
    staff.getColumn(col).numFmt = "@";
  }
  const lastDataRow = MAX_IMPORT_DATA_ROWS + 1;

  writeInstructions(instructions);
  const lists = writeReferenceData(reference);

  workbook.definedNames.add(lists.employmentRange, "EmploymentList");
  workbook.definedNames.add(lists.clearanceRange, "ClearanceList");
  workbook.definedNames.add(lists.yesNoRange, "YesNoValues");

  const employmentCol = STAFF_IMPORT_HEADERS.indexOf("Employment Status") + 1;
  const clearanceCol =
    STAFF_IMPORT_HEADERS.indexOf("Security Clearance Status") + 1;
  const applyCol = STAFF_IMPORT_HEADERS.indexOf("Apply Probation") + 1;

  addListValidation(staff, employmentCol, lastDataRow, "EmploymentList");
  addListValidation(staff, clearanceCol, lastDataRow, "ClearanceList");
  addListValidation(staff, applyCol, lastDataRow, "YesNoValues");

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function writeInstructions(sheet: ExcelJS.Worksheet) {
  sheet.columns = [{ header: "Staff import", width: 110 }];
  sheet.getRow(1).font = { bold: true, size: 14 };
  const lines = [
    "",
    "How to import",
    "1. Keep the Staff sheet headers exactly as they are. Do not rename, insert, or delete columns.",
    "2. Enter one person per row. Leave the Staff sheet blank of examples — examples are on this sheet only.",
    "3. Use Staff IDs consistently. After trimming extra spaces, each ID must be unique in this file and among active staff in your organisation. Matching is case-insensitive.",
    "4. Manager Staff ID must exactly match an active Staff ID already in NoShowHQ, or a Staff ID on another valid row in this file. Never match by name.",
    "5. Upload the file in NoShowHQ. The system checks every row before anything is created.",
    "6. No staff record is created until the entire file passes checks and you confirm the preview.",
    "",
    "Required columns: Staff ID, First Name, Last Name, Role.",
    "Staff ID: 1 to 80 characters. The stored value is the trimmed ID with repeated spaces collapsed.",
    "First Name and Last Name: 1 to 80 characters.",
    "Role: 2 to 120 characters. Free text in this release.",
    "Email is optional. If supplied it must be a valid email (max 254 characters). It is operational contact only and never creates a login.",
    "Phone is optional, 5 to 40 characters. International numbers are allowed.",
    "Department is optional, maximum 100 characters.",
    "Employment Status is optional: ACTIVE, MONITORING, CONTACT_REQUIRED, DISABLED or INACTIVE. Leave blank for ACTIVE.",
    "Dates must be ISO dates: YYYY-MM-DD (for example 2026-09-12). Do not use UK or US display formats.",
    "Start Date is required if Apply Probation is Yes.",
    "Apply Probation is Yes or No. Leave blank for No.",
    `Probation Length Days is an optional individual override, a whole number from 1 to ${MAX_PROBATION_DAYS}. Used only when Apply Probation is Yes and Probation End Date is blank. If both are blank, NoShowHQ uses your organisation’s current default duration at the moment you confirm the import.`,
    "Probation End Date is an optional manual override, YYYY-MM-DD, and must not be before Start Date. If supplied it takes precedence over Probation Length Days. This is shown clearly in the preview.",
    "If Apply Probation is No or blank, leave Probation Length Days and Probation End Date blank.",
    "Do not add a probation status or outcome column. Passed, Extended and Not continued are recorded later through the probation review workflow.",
    "Security Clearance Status is optional: NOT_REQUIRED, PENDING, VALID, EXPIRED or NOT_RECORDED. Leave blank for NOT_RECORDED.",
    "Security Clearance Expiry Date is required when clearance is VALID or EXPIRED, YYYY-MM-DD.",
    "Notes are optional internal notes, maximum 2,000 characters.",
    "",
    "This import creates operational staff records only. It does not create user accounts or send email or SMS.",
    "If any row needs correction, the whole file is rejected. Fix the rows and upload again. Valid rows are not imported on their own.",
    "A Staff ID already used in another organisation does not block this import.",
    "",
    "Example (do not copy onto the Staff sheet unless this is a real person)",
    "Staff ID: ST-1042",
    "First Name: Alex",
    "Last Name: Patel",
    "Role: Steward",
    "Email: alex.patel@example.com",
    "Department: South stand",
    "Manager Staff ID: ST-1001",
    "Employment Status: ACTIVE",
    "Start Date: 2026-09-01",
    "Apply Probation: Yes",
    "Security Clearance Status: NOT_RECORDED",
  ];
  lines.forEach((line, index) => {
    const row = sheet.getRow(index + 2);
    row.getCell(1).value = line;
    if (line && !line.includes(":") && line.length < 40) {
      row.font = { bold: true };
    }
  });
}

function writeReferenceData(sheet: ExcelJS.Worksheet): {
  employmentRange: string;
  clearanceRange: string;
  yesNoRange: string;
} {
  sheet.columns = [
    { header: "Employment Status", width: 24 },
    { header: "", width: 4 },
    { header: "Security Clearance Status", width: 28 },
    { header: "", width: 4 },
    { header: "Yes / No", width: 12 },
    { header: "", width: 4 },
    { header: "Notes", width: 72 },
  ];
  sheet.getRow(1).font = { bold: true };

  EMPLOYMENT_STATUSES.forEach((status, index) => {
    sheet.getCell(index + 2, 1).value = status;
  });
  SECURITY_CLEARANCE_STATUSES.forEach((status, index) => {
    sheet.getCell(index + 2, 3).value = status;
  });
  sheet.getCell(2, 5).value = "Yes";
  sheet.getCell(3, 5).value = "No";

  sheet.getCell(2, 7).value =
    "Use these values on the Staff sheet. NoShowHQ rechecks every value on upload.";
  sheet.getCell(3, 7).value =
    "Blank Employment Status becomes ACTIVE. Blank Apply Probation becomes No. Blank clearance becomes NOT_RECORDED.";
  sheet.getCell(4, 7).value =
    "VALID and EXPIRED clearance require a Security Clearance Expiry Date.";

  const quoted = `'${REFERENCE_SHEET_NAME}'`;
  return {
    employmentRange: `${quoted}!$A$2:$A$${EMPLOYMENT_STATUSES.length + 1}`,
    clearanceRange: `${quoted}!$C$2:$C$${SECURITY_CLEARANCE_STATUSES.length + 1}`,
    yesNoRange: `${quoted}!$E$2:$E$3`,
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
