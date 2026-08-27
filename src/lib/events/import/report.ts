import ExcelJS from "exceljs";
import {
  EVENT_IMPORT_HEADERS,
  IMPORT_ERRORS_COLUMN,
  IMPORT_STATUS_COLUMN,
} from "@/lib/events/import/constants";
import { escapeSpreadsheetCell } from "@/lib/events/import/cells";
import { importFieldLabel } from "@/lib/events/import/validate";
import type { ImportRowRaw } from "@/lib/events/import/types";

export type ErrorReportRow = {
  sourceRowNumber: number;
  raw: ImportRowRaw;
  status: string;
  fieldErrors: Record<string, string[]>;
};

export async function buildImportErrorReport(
  rows: ErrorReportRow[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Import errors");
  const headers = [
    "Source row",
    ...EVENT_IMPORT_HEADERS,
    IMPORT_STATUS_COLUMN,
    IMPORT_ERRORS_COLUMN,
  ];
  sheet.columns = headers.map((header) => ({
    header,
    width: Math.max(16, header.length + 2),
  }));
  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    const errors = formatFieldErrors(row.fieldErrors);
    const values = [
      row.sourceRowNumber,
      ...EVENT_IMPORT_HEADERS.map((header) =>
        escapeSpreadsheetCell(row.raw[header] ?? ""),
      ),
      row.status === "INVALID" ? "Needs correction" : row.status,
      escapeSpreadsheetCell(errors),
    ];
    sheet.addRow(values);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function formatFieldErrors(fieldErrors: Record<string, string[]>): string {
  const parts: string[] = [];
  for (const [field, messages] of Object.entries(fieldErrors)) {
    for (const message of messages) {
      parts.push(`${importFieldLabel(field)}: ${message}`);
    }
  }
  return parts.join(" | ");
}
