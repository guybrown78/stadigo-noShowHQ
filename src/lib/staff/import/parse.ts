import { parse } from "csv-parse/sync";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import {
  MAX_IMPORT_DATA_ROWS,
  STAFF_IMPORT_DATE_HEADERS,
  STAFF_IMPORT_HEADERS,
  STAFF_SHEET_NAME,
  type StaffImportHeader,
} from "@/lib/staff/import/constants";
import {
  cellToDisplayString,
  coerceEventDate,
} from "@/lib/events/import/cells";
import { detectImportKind, headerIndexMap } from "@/lib/staff/import/file";
import type { ImportRowRaw, ParsedImportRow } from "@/lib/staff/import/types";

export type ParseImportResult =
  | { ok: true; rows: ParsedImportRow[] }
  | { ok: false; error: string };

const DATE_HEADERS = new Set<string>(STAFF_IMPORT_DATE_HEADERS);

export async function parseImportFile(
  fileName: string,
  bytes: Uint8Array,
): Promise<ParseImportResult> {
  const kind = detectImportKind(fileName, bytes);
  if (kind === "csv") {
    return parseCsv(bytes);
  }
  if (kind === "xlsx") {
    const blocked = await inspectXlsxZip(bytes);
    if (blocked) {
      return { ok: false, error: blocked };
    }
    return parseXlsx(bytes);
  }
  return {
    ok: false,
    error:
      "Use the NoShowHQ .xlsx template, or a UTF-8 CSV with the same headers.",
  };
}

async function inspectXlsxZip(bytes: Uint8Array): Promise<string | null> {
  try {
    const zip = await JSZip.loadAsync(bytes);
    const names = Object.keys(zip.files);
    if (names.some((name) => /vbaProject/i.test(name))) {
      return "Macro-enabled workbooks are not accepted. Save the template as .xlsx without macros.";
    }
    if (names.some((name) => /EncryptedPackage/i.test(name))) {
      return "Password-protected files are not accepted. Remove the password and upload again.";
    }
    return null;
  } catch {
    return "This workbook could not be read. Save it as .xlsx without a password and try again.";
  }
}

function parseCsv(bytes: Uint8Array): ParseImportResult {
  let text = new TextDecoder("utf-8").decode(bytes);
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  let records: string[][];
  try {
    records = parse(text, {
      bom: true,
      relax_quotes: false,
      skip_empty_lines: false,
    }) as string[][];
  } catch {
    return {
      ok: false,
      error:
        "The CSV file could not be read. Save it as UTF-8 with the exact template headers.",
    };
  }
  if (records.length === 0) {
    return { ok: false, error: "The file has no header row." };
  }
  const mapped = headerIndexMap(records[0] ?? []);
  if (!mapped.ok) {
    return mapped;
  }
  const rows = records
    .slice(1)
    .map((row, index) =>
      toParsedRow(index + 2, valuesFromIndex(row, mapped.index)),
    );
  while (rows.length > 0 && rows[rows.length - 1]?.empty) {
    rows.pop();
  }
  if (rows.length > MAX_IMPORT_DATA_ROWS) {
    return {
      ok: false,
      error: `The file has more than ${MAX_IMPORT_DATA_ROWS.toLocaleString()} data rows. Split the directory into smaller files.`,
    };
  }
  return { ok: true, rows };
}

async function parseXlsx(bytes: Uint8Array): Promise<ParseImportResult> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
  } catch {
    return {
      ok: false,
      error:
        "This workbook could not be opened. Password-protected and unrelated formats are not accepted.",
    };
  }

  const sheet =
    workbook.getWorksheet(STAFF_SHEET_NAME) ?? workbook.worksheets[0];
  if (!sheet || sheet.name !== STAFF_SHEET_NAME) {
    return {
      ok: false,
      error: `The workbook must contain a sheet named ${STAFF_SHEET_NAME}. Download a fresh template and keep that sheet name.`,
    };
  }

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber - 1] = cellToDisplayString(cell.value);
  });
  const mapped = headerIndexMap(headers);
  if (!mapped.ok) {
    return mapped;
  }

  const lastRow = Math.max(sheet.rowCount, 1);
  const scanUntil = Math.min(lastRow, MAX_IMPORT_DATA_ROWS + 2);

  const rows: ParsedImportRow[] = [];
  for (let rowNumber = 2; rowNumber <= scanUntil; rowNumber += 1) {
    const excelRow = sheet.getRow(rowNumber);
    const values: string[] = [];
    const maxCol = Math.max(
      ...STAFF_IMPORT_HEADERS.map((header) => mapped.index[header] + 1),
      excelRow.cellCount,
    );
    for (let col = 1; col <= maxCol; col += 1) {
      const header = headers[col - 1];
      const asDate = DATE_HEADERS.has(header ?? "");
      values[col - 1] = cellToDisplayString(
        excelRow.getCell(col).value,
        asDate,
      );
    }
    rows.push(toParsedRow(rowNumber, valuesFromIndex(values, mapped.index)));
  }

  while (rows.length > 0 && rows[rows.length - 1]?.empty) {
    rows.pop();
  }
  if (rows.length > MAX_IMPORT_DATA_ROWS) {
    return {
      ok: false,
      error: `The file has more than ${MAX_IMPORT_DATA_ROWS.toLocaleString()} data rows. Split the directory into smaller files.`,
    };
  }

  return { ok: true, rows };
}

function valuesFromIndex(
  row: string[],
  index: Record<StaffImportHeader, number>,
): ImportRowRaw {
  const raw = {} as ImportRowRaw;
  for (const header of STAFF_IMPORT_HEADERS) {
    let value = (row[index[header]] ?? "").trim();
    if (DATE_HEADERS.has(header)) {
      value = coerceEventDate(value);
    }
    raw[header] = value;
  }
  return raw;
}

function toParsedRow(sourceRowNumber: number, raw: ImportRowRaw): ParsedImportRow {
  const empty = STAFF_IMPORT_HEADERS.every((header) => raw[header] === "");
  return { sourceRowNumber, raw, empty };
}
