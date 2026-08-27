export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_DATA_ROWS = 5000;
export const IMPORT_PREVIEW_PAGE_SIZE = 20;
export const IMPORT_EVENT_BATCH_SIZE = 250;
export const IMPORT_TRANSACTION_TIMEOUT_MS = 120_000;

export const EVENTS_SHEET_NAME = "Events";
export const INSTRUCTIONS_SHEET_NAME = "Instructions";
export const REFERENCE_SHEET_NAME = "Reference Data";

export const EVENT_IMPORT_HEADERS = [
  "Reference",
  "Event Name",
  "Event Type",
  "Event Subtype",
  "Venue Name",
  "Venue Address Line 1",
  "Venue Town/City",
  "Venue Postcode",
  "Event Date",
  "Briefing Time",
  "Start Time",
  "End Time",
  "Overnight",
  "Staff Required",
  "Warning Fill Rate %",
  "Critical Fill Rate %",
  "Status",
  "Notes",
] as const;

export type EventImportHeader = (typeof EVENT_IMPORT_HEADERS)[number];

export const IMPORT_STATUS_COLUMN = "Import Status";
export const IMPORT_ERRORS_COLUMN = "Import Errors";

export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const CSV_CONTENT_TYPE = "text/csv; charset=utf-8";
