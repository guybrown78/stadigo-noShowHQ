import {
  MAX_IMPORT_FILE_BYTES,
  STAFF_IMPORT_HEADERS,
  type StaffImportHeader,
} from "@/lib/staff/import/constants";

const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0];
const ZIP_SIGNATURE = [0x50, 0x4b];

export function sanitiseImportFileName(name: string): string {
  const base = name.replace(/\\/g, "/").split("/").pop() ?? "upload";
  const cleaned = base.replace(/[^\w.\- ()[\]]+/g, "_").trim();
  const safe = cleaned.length > 0 ? cleaned : "upload";
  return safe.slice(0, 200);
}

export function detectImportKind(
  fileName: string,
  bytes: Uint8Array,
): "xlsx" | "csv" | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".csv")) {
    return "csv";
  }
  if (lower.endsWith(".xlsx")) {
    return "xlsx";
  }
  if (lower.endsWith(".xls") || lower.endsWith(".xlsm") || lower.endsWith(".xlsb")) {
    return null;
  }
  if (hasPrefix(bytes, ZIP_SIGNATURE)) {
    return "xlsx";
  }
  return null;
}

export function validateImportFileBytes(
  fileName: string,
  bytes: Uint8Array,
): string | null {
  if (bytes.byteLength === 0) {
    return "The file is empty. Download the template, add your staff, and try again.";
  }
  if (bytes.byteLength > MAX_IMPORT_FILE_BYTES) {
    return `The file is larger than ${MAX_IMPORT_FILE_BYTES / (1024 * 1024)} MB. Split the directory into smaller files and try again.`;
  }
  if (hasPrefix(bytes, OLE_SIGNATURE) || fileName.toLowerCase().endsWith(".xls")) {
    return "Password-protected files and older .xls workbooks are not accepted. Save as .xlsx without a password, or use a UTF-8 CSV with the template headers.";
  }
  const kind = detectImportKind(fileName, bytes);
  if (!kind) {
    return "Use the NoShowHQ .xlsx template, or a UTF-8 CSV with the same headers. Macro-enabled and password-protected files are not accepted.";
  }
  if (kind === "xlsx" && !hasPrefix(bytes, ZIP_SIGNATURE)) {
    return "This workbook could not be read. Save it as .xlsx without a password and try again.";
  }
  return null;
}

export function headerIndexMap(
  headers: string[],
): { ok: true; index: Record<StaffImportHeader, number> } | { ok: false; error: string } {
  const index = {} as Record<StaffImportHeader, number>;
  const seen = new Map<string, number>();
  headers.forEach((header, i) => {
    const key = header.replace(/^\uFEFF/, "").trim();
    if (key) {
      seen.set(key, i);
    }
  });

  const missing = STAFF_IMPORT_HEADERS.filter((header) => !seen.has(header));
  if (missing.length > 0) {
    return {
      ok: false,
      error: `The file headers do not match the template. Missing: ${missing.join(", ")}. Download a fresh template and keep the header row unchanged.`,
    };
  }

  for (const header of STAFF_IMPORT_HEADERS) {
    index[header] = seen.get(header)!;
  }
  return { ok: true, index };
}

function hasPrefix(bytes: Uint8Array, prefix: number[]): boolean {
  if (bytes.byteLength < prefix.length) {
    return false;
  }
  return prefix.every((value, i) => bytes[i] === value);
}
