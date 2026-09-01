import type {
  EmploymentStatus,
  SecurityClearanceStatus,
} from "@prisma/client";
import { formatLocalDateIso } from "@/lib/events/dates";
import {
  EMPLOYMENT_STATUSES,
  SECURITY_CLEARANCE_STATUSES,
} from "@/lib/staff/catalog";
import {
  normalizeStaffIdKey,
  normalizeStaffIdNumber,
} from "@/lib/staff/normalize";
import { resolveProbation } from "@/lib/staff/probation";
import { flattenFieldErrors, staffInputSchema, type StaffInput } from "@/lib/staff/schema";
import type {
  ExistingStaffForImport,
  FieldErrors,
  ImportRowNormalized,
  ParsedImportRow,
  ProbationPreview,
  ValidatedImportRow,
} from "@/lib/staff/import/types";

export type ImportValidationResult = {
  rows: ValidatedImportRow[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
  ignoredRows: number;
  existingManagerMatchCount: number;
  importedManagerMatchCount: number;
  duplicateStaffIdCount: number;
  hasBlockingErrors: boolean;
};

const IMPORT_FIELD_LABEL: Record<string, string> = {
  staffIdNumber: "Staff ID",
  firstName: "First Name",
  lastName: "Last Name",
  roleTitle: "Role",
  email: "Email",
  phone: "Phone",
  department: "Department",
  managerStaffId: "Manager Staff ID",
  employmentStatus: "Employment Status",
  startDate: "Start Date",
  applyProbation: "Apply Probation",
  probationLengthDays: "Probation Length Days",
  probationEndDate: "Probation End Date",
  securityClearanceStatus: "Security Clearance Status",
  securityClearanceExpiryDate: "Security Clearance Expiry Date",
  notes: "Notes",
};

export function importFieldLabel(field: string): string {
  return IMPORT_FIELD_LABEL[field] ?? field;
}

export function staffInputFromNormalized(
  normalized: ImportRowNormalized,
): StaffInput {
  return {
    staffIdNumber: normalized.staffIdNumber,
    firstName: normalized.firstName,
    lastName: normalized.lastName,
    email: normalized.email,
    phone: normalized.phone,
    department: normalized.department,
    roleTitle: normalized.roleTitle,
    managerStaffId: null,
    employmentStatus: normalized.employmentStatus,
    startDate: normalized.startDate,
    applyProbation: normalized.applyProbation,
    probationLengthDays: normalized.probationLengthDays,
    overrideProbationEndDate: normalized.overrideProbationEndDate,
    probationEndDate: normalized.probationEndDate,
    probationStatus: normalized.applyProbation
      ? "IN_PROGRESS"
      : "NOT_APPLICABLE",
    securityClearanceStatus: normalized.securityClearanceStatus,
    securityClearanceExpiryDate: normalized.securityClearanceExpiryDate,
    notes: normalized.notes,
  };
}

export function buildProbationPreview(
  normalized: ImportRowNormalized,
  tenantDefaultDays: number,
): ProbationPreview | null {
  const resolved = resolveProbation({
    applyProbation: normalized.applyProbation,
    startDate: normalized.startDate,
    durationOverride: normalized.probationLengthDays,
    overrideEndDate: normalized.overrideProbationEndDate,
    endDateOverride: normalized.probationEndDate,
    tenantDefaultDays,
  });
  if (!resolved.ok) {
    return {
      applyProbation: normalized.applyProbation,
      durationSource: null,
      effectiveDurationDays: null,
      startDate: normalized.startDate,
      endDate: normalized.probationEndDate,
      reviewDueDate: null,
      manualEndDate: normalized.overrideProbationEndDate,
    };
  }
  return {
    applyProbation: resolved.value.probationStatus === "IN_PROGRESS",
    durationSource: resolved.value.durationSource,
    effectiveDurationDays: resolved.value.effectiveDurationDays,
    startDate: resolved.value.startDate
      ? formatLocalDateIso(resolved.value.startDate)
      : null,
    endDate: resolved.value.probationEndDate
      ? formatLocalDateIso(resolved.value.probationEndDate)
      : null,
    reviewDueDate: resolved.value.probationReviewDueDate
      ? formatLocalDateIso(resolved.value.probationReviewDueDate)
      : null,
    manualEndDate: resolved.value.durationSource === "MANUAL_END_DATE",
  };
}

export function validateImportRows(
  parsed: ParsedImportRow[],
  params: {
    existingStaff: ExistingStaffForImport[];
    tenantDefaultDays: number;
  },
): ImportValidationResult {
  const existingByKey = new Map(
    params.existingStaff.map((staff) => [staff.staffIdNormalized, staff]),
  );

  const rows: ValidatedImportRow[] = parsed.map((row) => {
    if (row.empty) {
      return {
        sourceRowNumber: row.sourceRowNumber,
        raw: row.raw,
        status: "IGNORED",
        fieldErrors: {},
        normalized: null,
        managerOutcome: null,
        probationPreview: null,
      };
    }
    return validateOneRow(row, params.tenantDefaultDays);
  });

  const fileIds = new Map<string, number[]>();
  for (const row of rows) {
    const key = row.normalized?.staffIdNormalized;
    if (!key || row.status === "IGNORED") {
      continue;
    }
    const list = fileIds.get(key) ?? [];
    list.push(row.sourceRowNumber);
    fileIds.set(key, list);
  }

  for (const row of rows) {
    if (row.status === "IGNORED" || !row.normalized) {
      continue;
    }
    const key = row.normalized.staffIdNormalized;
    const inFile = fileIds.get(key) ?? [];
    if (inFile.length > 1) {
      addError(
        row,
        "staffIdNumber",
        "This Staff ID is used more than once in the file. Each Staff ID must be unique.",
      );
    }
    if (existingByKey.has(key)) {
      addError(
        row,
        "staffIdNumber",
        "This staff ID is already used in your organisation",
      );
    }
  }

  resolveManagers(rows, existingByKey);
  detectManagerCycles(rows);

  for (const row of rows) {
    if (row.status !== "VALID" || !row.normalized) {
      continue;
    }
    row.probationPreview = buildProbationPreview(
      row.normalized,
      params.tenantDefaultDays,
    );
  }

  const validRows = rows.filter((row) => row.status === "VALID").length;
  const invalidRows = rows.filter((row) => row.status === "INVALID").length;
  const ignoredRows = rows.filter((row) => row.status === "IGNORED").length;
  const duplicateStaffIdCount = rows.filter(
    (row) =>
      row.status === "INVALID" &&
      row.fieldErrors.staffIdNumber?.some((message) =>
        /already used|more than once/i.test(message),
      ),
  ).length;

  return {
    rows,
    totalRows: rows.length,
    validRows,
    invalidRows,
    ignoredRows,
    existingManagerMatchCount: rows.filter(
      (row) => row.status === "VALID" && row.managerOutcome?.kind === "existing",
    ).length,
    importedManagerMatchCount: rows.filter(
      (row) => row.status === "VALID" && row.managerOutcome?.kind === "import",
    ).length,
    duplicateStaffIdCount,
    hasBlockingErrors: invalidRows > 0,
  };
}

function validateOneRow(
  row: ParsedImportRow,
  tenantDefaultDays: number,
): ValidatedImportRow {
  const fieldErrors: FieldErrors = {};
  const raw = row.raw;

  const applyProbation = parseYesNo(raw["Apply Probation"]);
  if (!applyProbation.ok) {
    pushError(
      fieldErrors,
      "applyProbation",
      "Apply Probation must be Yes or No. Leave blank for No.",
    );
  }

  const employment = parseEmployment(raw["Employment Status"]);
  if (!employment.ok) {
    pushError(
      fieldErrors,
      "employmentStatus",
      "Employment Status must be ACTIVE, MONITORING, CONTACT_REQUIRED, DISABLED or INACTIVE. Leave blank for ACTIVE.",
    );
  }

  const clearance = parseClearance(raw["Security Clearance Status"]);
  if (!clearance.ok) {
    pushError(
      fieldErrors,
      "securityClearanceStatus",
      "Security Clearance Status must be NOT_REQUIRED, PENDING, VALID, EXPIRED or NOT_RECORDED. Leave blank for NOT_RECORDED.",
    );
  }

  const apply = applyProbation.ok ? applyProbation.value : false;
  if (
    !apply &&
    (raw["Probation Length Days"].trim() !== "" ||
      raw["Probation End Date"].trim() !== "")
  ) {
    pushError(
      fieldErrors,
      "applyProbation",
      "Leave Probation Length Days and Probation End Date blank unless Apply Probation is Yes.",
    );
  }

  const overrideEnd = apply && raw["Probation End Date"].trim() !== "";

  const parsed = staffInputSchema.safeParse({
    staffIdNumber: raw["Staff ID"],
    firstName: raw["First Name"],
    lastName: raw["Last Name"],
    email: raw.Email,
    phone: raw.Phone,
    department: raw.Department,
    roleTitle: raw.Role,
    managerStaffId: "",
    employmentStatus: employment.ok ? employment.value : "ACTIVE",
    startDate: raw["Start Date"],
    applyProbation: apply,
    probationLengthDays: raw["Probation Length Days"],
    overrideProbationEndDate: overrideEnd,
    probationEndDate: raw["Probation End Date"],
    probationStatus: apply ? "IN_PROGRESS" : "NOT_APPLICABLE",
    securityClearanceStatus: clearance.ok ? clearance.value : "NOT_RECORDED",
    securityClearanceExpiryDate: raw["Security Clearance Expiry Date"],
    notes: raw.Notes,
  });

  if (!parsed.success) {
    const schemaErrors = flattenFieldErrors(parsed.error);
    for (const [field, messages] of Object.entries(schemaErrors)) {
      for (const message of messages) {
        pushError(fieldErrors, field, rewriteSchemaMessage(field, message));
      }
    }
  }

  const normalized = parsed.success
    ? toNormalized(parsed.data, raw, apply, overrideEnd)
    : null;

  if (normalized) {
    const probation = resolveProbation({
      applyProbation: normalized.applyProbation,
      startDate: normalized.startDate,
      durationOverride: normalized.probationLengthDays,
      overrideEndDate: normalized.overrideProbationEndDate,
      endDateOverride: normalized.probationEndDate,
      tenantDefaultDays,
    });
    if (!probation.ok) {
      for (const [field, messages] of Object.entries(probation.fieldErrors)) {
        for (const message of messages) {
          pushError(fieldErrors, field, rewriteSchemaMessage(field, message));
        }
      }
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      sourceRowNumber: row.sourceRowNumber,
      raw,
      status: "INVALID",
      fieldErrors,
      normalized,
      managerOutcome: null,
      probationPreview: null,
    };
  }

  return {
    sourceRowNumber: row.sourceRowNumber,
    raw,
    status: "VALID",
    fieldErrors: {},
    normalized,
    managerOutcome: { kind: "none" },
    probationPreview: null,
  };
}

function toNormalized(
  data: StaffInput,
  raw: ParsedImportRow["raw"],
  applyProbation: boolean,
  overrideEnd: boolean,
): ImportRowNormalized {
  const managerRaw = raw["Manager Staff ID"].trim();
  return {
    staffIdNumber: data.staffIdNumber,
    staffIdNormalized: normalizeStaffIdKey(data.staffIdNumber),
    firstName: data.firstName,
    lastName: data.lastName,
    roleTitle: data.roleTitle,
    email: data.email,
    phone: data.phone,
    department: data.department,
    managerStaffIdNumber: managerRaw
      ? normalizeStaffIdNumber(managerRaw)
      : null,
    employmentStatus: data.employmentStatus,
    startDate: data.startDate,
    applyProbation,
    probationLengthDays: data.probationLengthDays,
    overrideProbationEndDate: overrideEnd,
    probationEndDate: data.probationEndDate,
    securityClearanceStatus: data.securityClearanceStatus,
    securityClearanceExpiryDate: data.securityClearanceExpiryDate,
    notes: data.notes,
  };
}

function resolveManagers(
  rows: ValidatedImportRow[],
  existingByKey: Map<string, ExistingStaffForImport>,
) {
  const importByKey = new Map<
    string,
    { row: ValidatedImportRow; normalized: ImportRowNormalized }
  >();
  for (const row of rows) {
    if (!row.normalized) {
      continue;
    }
    if (!importByKey.has(row.normalized.staffIdNormalized)) {
      importByKey.set(row.normalized.staffIdNormalized, {
        row,
        normalized: row.normalized,
      });
    }
  }

  for (const row of rows) {
    if (row.status === "IGNORED" || !row.normalized) {
      continue;
    }
    const managerId = row.normalized.managerStaffIdNumber;
    if (!managerId) {
      row.managerOutcome = { kind: "none" };
      continue;
    }
    const managerKey = normalizeStaffIdKey(managerId);
    if (managerKey === row.normalized.staffIdNormalized) {
      addError(
        row,
        "managerStaffId",
        "A staff member cannot be their own manager. Remove the Manager Staff ID or use a different person.",
      );
      row.managerOutcome = null;
      continue;
    }

    const existing = existingByKey.get(managerKey);
    if (existing) {
      if (existing.employmentStatus !== "ACTIVE") {
        addError(
          row,
          "managerStaffId",
          "This Manager Staff ID belongs to a staff member who is not active. Choose an active staff member or a valid row in this file.",
        );
        row.managerOutcome = null;
        continue;
      }
      row.managerOutcome = {
        kind: "existing",
        managerStaffId: existing.id,
        staffIdNumber: existing.staffIdNumber,
        name: `${existing.firstName} ${existing.lastName}`,
      };
      continue;
    }

    const imported = importByKey.get(managerKey);
    if (imported) {
      if (imported.row.status !== "VALID") {
        addError(
          row,
          "managerStaffId",
          "Manager Staff ID must match an active staff member in your organisation or another valid row in this file.",
        );
        row.managerOutcome = null;
        continue;
      }
      if (imported.normalized.employmentStatus !== "ACTIVE") {
        addError(
          row,
          "managerStaffId",
          "The manager in this file must have Employment Status ACTIVE.",
        );
        row.managerOutcome = null;
        continue;
      }
      row.managerOutcome = {
        kind: "import",
        sourceRowNumber: imported.row.sourceRowNumber,
        staffIdNumber: imported.normalized.staffIdNumber,
        name: `${imported.normalized.firstName} ${imported.normalized.lastName}`,
      };
      continue;
    }

    addError(
      row,
      "managerStaffId",
      "No staff member with this Staff ID is active in your organisation, and it does not match another row in this file.",
    );
    row.managerOutcome = null;
  }
}

function detectManagerCycles(rows: ValidatedImportRow[]) {
  const byKey = new Map<string, ValidatedImportRow>();
  for (const row of rows) {
    if (!row.normalized) {
      continue;
    }
    byKey.set(row.normalized.staffIdNormalized, row);
  }

  const graph = new Map<string, string>();
  for (const row of rows) {
    if (
      row.status === "IGNORED" ||
      !row.normalized ||
      row.managerOutcome?.kind !== "import"
    ) {
      continue;
    }
    graph.set(
      row.normalized.staffIdNormalized,
      normalizeStaffIdKey(row.managerOutcome.staffIdNumber),
    );
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cyclic = new Set<string>();

  function walk(node: string, path: string[]) {
    if (visited.has(node)) {
      return;
    }
    if (visiting.has(node)) {
      const start = path.indexOf(node);
      const loop = start >= 0 ? path.slice(start) : path.concat(node);
      for (const item of loop) {
        cyclic.add(item);
      }
      return;
    }
    visiting.add(node);
    const next = graph.get(node);
    if (next) {
      walk(next, path.concat(node));
    }
    visiting.delete(node);
    visited.add(node);
  }

  for (const node of graph.keys()) {
    walk(node, []);
  }

  for (const key of cyclic) {
    const row = byKey.get(key);
    if (!row || row.status === "IGNORED") {
      continue;
    }
    addError(
      row,
      "managerStaffId",
      "This Manager Staff ID would create a reporting cycle. Change the manager so nobody reports in a loop.",
    );
  }
}

function parseYesNo(
  value: string,
): { ok: true; value: boolean } | { ok: false } {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return { ok: true, value: false };
  }
  if (["yes", "y", "true", "1"].includes(trimmed)) {
    return { ok: true, value: true };
  }
  if (["no", "n", "false", "0"].includes(trimmed)) {
    return { ok: true, value: false };
  }
  return { ok: false };
}

function parseEmployment(
  value: string,
): { ok: true; value: EmploymentStatus } | { ok: false } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: true, value: "ACTIVE" };
  }
  const match = EMPLOYMENT_STATUSES.find(
    (status) => status.toLowerCase() === trimmed.toLowerCase(),
  );
  if (!match) {
    return { ok: false };
  }
  return { ok: true, value: match };
}

function parseClearance(
  value: string,
): { ok: true; value: SecurityClearanceStatus } | { ok: false } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: true, value: "NOT_RECORDED" };
  }
  const match = SECURITY_CLEARANCE_STATUSES.find(
    (status) => status.toLowerCase() === trimmed.toLowerCase(),
  );
  if (!match) {
    return { ok: false };
  }
  return { ok: true, value: match };
}

function rewriteSchemaMessage(field: string, message: string): string {
  if (
    field === "startDate" ||
    field === "probationEndDate" ||
    field === "securityClearanceExpiryDate"
  ) {
    if (/valid date/i.test(message) || /enter a/i.test(message)) {
      return `${importFieldLabel(field)} must be a valid calendar date in YYYY-MM-DD format.`;
    }
  }
  return message;
}

function pushError(target: FieldErrors, field: string, message: string) {
  const existing = target[field] ?? [];
  if (!existing.includes(message)) {
    existing.push(message);
  }
  target[field] = existing;
}

function addError(row: ValidatedImportRow, field: string, message: string) {
  pushError(row.fieldErrors, field, message);
  row.status = "INVALID";
}
