export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_DATA_ROWS = 5000;
export const IMPORT_PREVIEW_PAGE_SIZE = 20;
export const IMPORT_STAFF_BATCH_SIZE = 100;
export const IMPORT_TRANSACTION_TIMEOUT_MS = 120_000;

export const STAFF_SHEET_NAME = "Staff";
export const INSTRUCTIONS_SHEET_NAME = "Instructions";
export const REFERENCE_SHEET_NAME = "Reference Data";

export const STAFF_IMPORT_HEADERS = [
  "Staff ID",
  "First Name",
  "Last Name",
  "Role",
  "Email",
  "Phone",
  "Department",
  "Manager Staff ID",
  "Employment Status",
  "Start Date",
  "Apply Probation",
  "Probation Length Days",
  "Probation End Date",
  "Security Clearance Status",
  "Security Clearance Expiry Date",
  "Notes",
] as const;

export type StaffImportHeader = (typeof STAFF_IMPORT_HEADERS)[number];

export const STAFF_IMPORT_DATE_HEADERS = [
  "Start Date",
  "Probation End Date",
  "Security Clearance Expiry Date",
] as const;

export const IMPORT_STATUS_COLUMN = "Import Status";
export const IMPORT_ERRORS_COLUMN = "Import Errors";

export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const CSV_CONTENT_TYPE = "text/csv; charset=utf-8";
