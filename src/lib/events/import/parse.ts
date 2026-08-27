import { parse } from "csv-parse/sync";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import {
  EVENT_IMPORT_HEADERS,
  EVENTS_SHEET_NAME,
  MAX_IMPORT_DATA_ROWS,
  type EventImportHeader,
} from "@/lib/events/import/constants";
import { cellToDisplayString, coerceEventDate, coerceTime } from "@/lib/events/import/cells";
import { detectImportKind, headerIndexMap } from "@/lib/events/import/file";
import type { ImportRowRaw, ParsedImportRow } from "@/lib/events/import/types";

export type ParseImportResult =
  | { ok: true; rows: ParsedImportRow[] }
  | { ok: false; error: string };

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
      error: `The file has more than ${MAX_IMPORT_DATA_ROWS.toLocaleString()} data rows. Split the programme into smaller files.`,
    };
  }
  return { ok: true, rows };
}

async function parseXlsx(bytes: Uint8Array): Promise<ParseImportResult> {
  const workbook = new ExcelJS.Workbook();
  try {
    // ExcelJS accepts Buffer; copy into a Node buffer without assuming SharedArrayBuffer.
    await workbook.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
  } catch {
    return {
      ok: false,
      error:
        "This workbook could not be opened. Password-protected and unrelated formats are not accepted.",
    };
  }

  const sheet =
    workbook.getWorksheet(EVENTS_SHEET_NAME) ?? workbook.worksheets[0];
  if (!sheet || sheet.name !== EVENTS_SHEET_NAME) {
    return {
      ok: false,
      error: `The workbook must contain a sheet named ${EVENTS_SHEET_NAME}. Download a fresh template and keep that sheet name.`,
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
      ...EVENT_IMPORT_HEADERS.map((header) => mapped.index[header] + 1),
      excelRow.cellCount,
    );
    for (let col = 1; col <= maxCol; col += 1) {
      const header = headers[col - 1];
      const asDate = header === "Event Date";
      const asTime =
        header === "Briefing Time" ||
        header === "Start Time" ||
        header === "End Time";
      values[col - 1] = cellToDisplayString(
        excelRow.getCell(col).value,
        asDate,
        asTime,
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
      error: `The file has more than ${MAX_IMPORT_DATA_ROWS.toLocaleString()} data rows. Split the programme into smaller files.`,
    };
  }

  return { ok: true, rows };
}

function valuesFromIndex(
  row: string[],
  index: Record<EventImportHeader, number>,
): ImportRowRaw {
  const raw = {} as ImportRowRaw;
  for (const header of EVENT_IMPORT_HEADERS) {
    let value = (row[index[header]] ?? "").trim();
    if (header === "Event Date") {
      value = coerceEventDate(value);
    }
    if (
      header === "Briefing Time" ||
      header === "Start Time" ||
      header === "End Time"
    ) {
      value = coerceTime(value);
    }
    raw[header] = value;
  }
  return raw;
}

function toParsedRow(sourceRowNumber: number, raw: ImportRowRaw): ParsedImportRow {
  const empty = EVENT_IMPORT_HEADERS.every((header) => raw[header] === "");
  return { sourceRowNumber, raw, empty };
}
