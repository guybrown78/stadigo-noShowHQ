import { describe, expect, it } from "vitest";
import { STAFF_IMPORT_HEADERS } from "@/lib/staff/import/constants";
import { parseImportFile } from "@/lib/staff/import/parse";
import { validateImportRows } from "@/lib/staff/import/validate";
import type {
  ExistingStaffForImport,
  ImportRowRaw,
} from "@/lib/staff/import/types";

function csvFromRows(rows: Array<Partial<ImportRowRaw>>): Uint8Array {
  const lines = [
    STAFF_IMPORT_HEADERS.join(","),
    ...rows.map((row) =>
      STAFF_IMPORT_HEADERS.map((header) => csvEscape(row[header] ?? "")).join(
        ",",
      ),
    ),
  ];
  return new TextEncoder().encode(lines.join("\n"));
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

const validRow: Partial<ImportRowRaw> = {
  "Staff ID": "ST-1042",
  "First Name": "Alex",
  "Last Name": "Patel",
  Role: "Steward",
};

describe("staff import parse", () => {
  it("rejects files whose headers do not match the template", async () => {
    const bytes = new TextEncoder().encode("Name,Role\nAlex,Steward\n");
    const parsed = await parseImportFile("staff.csv", bytes);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error).toMatch(/headers/i);
    }
  });

  it("keeps empty rows in the middle and trims trailing empty rows", async () => {
    const bytes = csvFromRows([
      {},
      validRow,
      {},
      { ...validRow, "Staff ID": "ST-1043" },
      {},
    ]);
    const parsed = await parseImportFile("staff.csv", bytes);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rows).toHaveLength(4);
    expect(parsed.rows[0]?.empty).toBe(true);
    expect(parsed.rows[1]?.empty).toBe(false);
    expect(parsed.rows[2]?.empty).toBe(true);
    expect(parsed.rows[3]?.empty).toBe(false);
  });

  it("extracts email from a mailto hyperlink cell", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Staff");
    sheet.addRow([...STAFF_IMPORT_HEADERS]);
    const data = sheet.addRow(
      STAFF_IMPORT_HEADERS.map((header) => validRow[header] ?? ""),
    );
    data.getCell(STAFF_IMPORT_HEADERS.indexOf("Email") + 1).value = {
      text: {
        richText: [{ text: "lauren.mills@example.com" }],
      },
      hyperlink: "mailto:lauren.mills@example.com",
    };
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const parsed = await parseImportFile("staff.xlsx", new Uint8Array(buffer));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rows[0]?.raw.Email).toBe("lauren.mills@example.com");
  });
});

describe("staff import validation", () => {
  it("accepts a valid row and applies documented defaults", async () => {
    const parsed = await parseImportFile("staff.csv", csvFromRows([validRow]));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = validateImportRows(parsed.rows, {
      existingStaff: [],
      tenantDefaultDays: 90,
    });
    expect(result.hasBlockingErrors).toBe(false);
    expect(result.validRows).toBe(1);
    expect(result.rows[0]?.normalized?.employmentStatus).toBe("ACTIVE");
    expect(result.rows[0]?.normalized?.applyProbation).toBe(false);
    expect(result.rows[0]?.normalized?.securityClearanceStatus).toBe(
      "NOT_RECORDED",
    );
  });

  it("blocks the whole file when one row is invalid", async () => {
    const parsed = await parseImportFile(
      "staff.csv",
      csvFromRows([validRow, { "Staff ID": "ST-2", "First Name": "Only" }]),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = validateImportRows(parsed.rows, {
      existingStaff: [],
      tenantDefaultDays: 90,
    });
    expect(result.hasBlockingErrors).toBe(true);
    expect(result.invalidRows).toBeGreaterThan(0);
  });

  it("detects duplicate staff IDs in the file case-insensitively", async () => {
    const parsed = await parseImportFile(
      "staff.csv",
      csvFromRows([
        validRow,
        { ...validRow, "Staff ID": "st-1042", "First Name": "Jamie" },
      ]),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = validateImportRows(parsed.rows, {
      existingStaff: [],
      tenantDefaultDays: 90,
    });
    expect(result.hasBlockingErrors).toBe(true);
    expect(result.duplicateStaffIdCount).toBe(2);
  });

  it("blocks a staff ID already used by live staff in the tenant", async () => {
    const existing: ExistingStaffForImport[] = [
      {
        id: "existing-1",
        staffIdNumber: "ST-1042",
        staffIdNormalized: "st-1042",
        firstName: "Existing",
        lastName: "Person",
        employmentStatus: "ACTIVE",
      },
    ];
    const parsed = await parseImportFile("staff.csv", csvFromRows([validRow]));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = validateImportRows(parsed.rows, {
      existingStaff: existing,
      tenantDefaultDays: 90,
    });
    expect(result.hasBlockingErrors).toBe(true);
    expect(result.rows[0]?.fieldErrors.staffIdNumber?.[0]).toMatch(/already used/i);
  });

  it("matches an existing active manager and an in-file manager", async () => {
    const existing: ExistingStaffForImport[] = [
      {
        id: "mgr-1",
        staffIdNumber: "ST-1001",
        staffIdNormalized: "st-1001",
        firstName: "Morgan",
        lastName: "Lee",
        employmentStatus: "ACTIVE",
      },
    ];
    const parsed = await parseImportFile(
      "staff.csv",
      csvFromRows([
        {
          "Staff ID": "ST-2001",
          "First Name": "Pat",
          "Last Name": "Ng",
          Role: "Supervisor",
        },
        {
          "Staff ID": "ST-2002",
          "First Name": "Sam",
          "Last Name": "Cole",
          Role: "Steward",
          "Manager Staff ID": "ST-2001",
        },
        {
          "Staff ID": "ST-2003",
          "First Name": "Riley",
          "Last Name": "Shah",
          Role: "Steward",
          "Manager Staff ID": "ST-1001",
        },
      ]),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = validateImportRows(parsed.rows, {
      existingStaff: existing,
      tenantDefaultDays: 90,
    });
    expect(result.hasBlockingErrors).toBe(false);
    expect(result.importedManagerMatchCount).toBe(1);
    expect(result.existingManagerMatchCount).toBe(1);
  });

  it("rejects inactive, unknown, self and cyclic managers", async () => {
    const existing: ExistingStaffForImport[] = [
      {
        id: "mgr-inactive",
        staffIdNumber: "ST-9",
        staffIdNormalized: "st-9",
        firstName: "Inactive",
        lastName: "Boss",
        employmentStatus: "INACTIVE",
      },
    ];
    const parsed = await parseImportFile(
      "staff.csv",
      csvFromRows([
        {
          ...validRow,
          "Staff ID": "ST-A",
          "Manager Staff ID": "ST-A",
        },
        {
          ...validRow,
          "Staff ID": "ST-B",
          "Manager Staff ID": "ST-C",
        },
        {
          ...validRow,
          "Staff ID": "ST-C",
          "Manager Staff ID": "ST-B",
        },
        {
          ...validRow,
          "Staff ID": "ST-D",
          "Manager Staff ID": "ST-9",
        },
        {
          ...validRow,
          "Staff ID": "ST-E",
          "Manager Staff ID": "ST-UNKNOWN",
        },
      ]),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = validateImportRows(parsed.rows, {
      existingStaff: existing,
      tenantDefaultDays: 90,
    });
    expect(result.hasBlockingErrors).toBe(true);
    expect(result.rows[0]?.fieldErrors.managerStaffId?.[0]).toMatch(/own manager/i);
    expect(result.rows[1]?.fieldErrors.managerStaffId?.[0]).toMatch(/cycle/i);
    expect(result.rows[2]?.fieldErrors.managerStaffId?.[0]).toMatch(/cycle/i);
    expect(result.rows[3]?.fieldErrors.managerStaffId?.[0]).toMatch(/not active/i);
    expect(result.rows[4]?.fieldErrors.managerStaffId?.[0]).toMatch(/does not match/i);
  });

  it("requires clearance expiry for VALID and EXPIRED", async () => {
    const parsed = await parseImportFile(
      "staff.csv",
      csvFromRows([
        {
          ...validRow,
          "Security Clearance Status": "VALID",
        },
      ]),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = validateImportRows(parsed.rows, {
      existingStaff: [],
      tenantDefaultDays: 90,
    });
    expect(result.hasBlockingErrors).toBe(true);
    expect(
      result.rows[0]?.fieldErrors.securityClearanceExpiryDate?.[0],
    ).toMatch(/YYYY-MM-DD|expiry/i);
  });

  it("rejects probation duration when Apply Probation is No", async () => {
    const parsed = await parseImportFile(
      "staff.csv",
      csvFromRows([
        {
          ...validRow,
          "Apply Probation": "No",
          "Probation Length Days": "90",
        },
      ]),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = validateImportRows(parsed.rows, {
      existingStaff: [],
      tenantDefaultDays: 90,
    });
    expect(result.hasBlockingErrors).toBe(true);
    expect(result.rows[0]?.fieldErrors.applyProbation?.[0]).toMatch(/blank/i);
  });

  it("previews tenant default, duration override and manual end date", async () => {
    const parsed = await parseImportFile(
      "staff.csv",
      csvFromRows([
        {
          ...validRow,
          "Staff ID": "ST-P1",
          "Start Date": "2026-09-01",
          "Apply Probation": "Yes",
        },
        {
          ...validRow,
          "Staff ID": "ST-P2",
          "Start Date": "2026-09-01",
          "Apply Probation": "Yes",
          "Probation Length Days": "120",
        },
        {
          ...validRow,
          "Staff ID": "ST-P3",
          "Start Date": "2026-09-01",
          "Apply Probation": "Yes",
          "Probation Length Days": "30",
          "Probation End Date": "2026-11-15",
        },
      ]),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = validateImportRows(parsed.rows, {
      existingStaff: [],
      tenantDefaultDays: 90,
    });
    expect(result.hasBlockingErrors).toBe(false);
    expect(result.rows[0]?.probationPreview?.durationSource).toBe(
      "TENANT_DEFAULT",
    );
    expect(result.rows[1]?.probationPreview?.durationSource).toBe(
      "INDIVIDUAL_OVERRIDE",
    );
    expect(result.rows[2]?.probationPreview?.durationSource).toBe(
      "MANUAL_END_DATE",
    );
    expect(result.rows[2]?.probationPreview?.manualEndDate).toBe(true);
  });
});
