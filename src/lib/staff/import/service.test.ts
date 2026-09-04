import { Role, StaffImportStatus } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { StaffAccessError } from "@/lib/staff/errors";
import { STAFF_IMPORT_HEADERS } from "@/lib/staff/import/constants";
import {
  getImportForTenant,
  getImportSummaryForTenant,
} from "@/lib/staff/import/queries";
import {
  confirmStaffImport,
  createImportFromUpload,
} from "@/lib/staff/import/service";
import { buildStaffImportTemplate } from "@/lib/staff/import/template";
import type { ImportRowRaw } from "@/lib/staff/import/types";
import { parseImportFile } from "@/lib/staff/import/parse";
import { createStaff } from "@/lib/staff/service";
import type { StaffInput } from "@/lib/staff/schema";

const prefix = `vitest-staff-import-${Date.now()}`;

type Fixture = {
  tenant: { id: string; name: string; slug: string };
  user: { id: string };
};

let tenantA: Fixture;
let tenantB: Fixture;

async function createFixture(label: string): Promise<Fixture> {
  const tenant = await prisma.tenant.create({
    data: {
      name: `Vitest Staff Import ${label}`,
      slug: `${prefix}-${label}`.toLowerCase(),
      defaultProbationDays: 90,
    },
  });
  const user = await prisma.user.create({
    data: {
      email: `${prefix}-${label}@example.test`,
      firstName: "Test",
      lastName: label,
      name: `Test ${label}`,
      passwordHash: "not-used",
      role: Role.ADMIN,
      tenantId: tenant.id,
    },
  });
  return { tenant, user };
}

function csvFromRows(rows: Array<Partial<ImportRowRaw>>): Uint8Array {
  const lines = [
    STAFF_IMPORT_HEADERS.join(","),
    ...rows.map((row) =>
      STAFF_IMPORT_HEADERS.map((header) => {
        const value = row[header] ?? "";
        if (/[",\n]/.test(value)) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(","),
    ),
  ];
  return new TextEncoder().encode(`${lines.join("\n")}\n`);
}

function validRow(
  staffId: string,
  overrides: Partial<ImportRowRaw> = {},
): Partial<ImportRowRaw> {
  return {
    "Staff ID": staffId,
    "First Name": "Alex",
    "Last Name": "Patel",
    Role: "Steward",
    ...overrides,
  };
}

function staffInput(overrides: Partial<StaffInput> = {}): StaffInput {
  return {
    staffIdNumber: "ST-EXISTING",
    firstName: "Morgan",
    lastName: "Lee",
    email: null,
    phone: null,
    department: null,
    roleTitle: "Supervisor",
    managerStaffId: null,
    employmentStatus: "ACTIVE",
    startDate: null,
    applyProbation: false,
    probationLengthDays: null,
    overrideProbationEndDate: false,
    probationEndDate: null,
    probationStatus: "NOT_APPLICABLE",
    securityClearanceStatus: "NOT_RECORDED",
    securityClearanceExpiryDate: null,
    notes: null,
    ...overrides,
  };
}

beforeAll(async () => {
  tenantA = await createFixture("a");
  tenantB = await createFixture("b");
});

afterAll(async () => {
  const tenantIds = [tenantA?.tenant.id, tenantB?.tenant.id].filter(Boolean);
  await prisma.staffImport.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
  await prisma.staffProbationTask.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
  await prisma.staffProbationHistory.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
  await prisma.staffProbation.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
  await prisma.staff.updateMany({
    where: { tenantId: { in: tenantIds } },
    data: { managerStaffId: null },
  });
  await prisma.staff.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  await prisma.$disconnect();
});

describe("staff import service", () => {
  it("creates a template that the importer can parse", async () => {
    const buffer = await buildStaffImportTemplate();
    const parsed = await parseImportFile("noshowhq-staff-import.xlsx", buffer);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rows.every((row) => row.empty)).toBe(true);
  });

  it("imports valid rows with existing and in-file managers and probation variants", async () => {
    const manager = await createStaff(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: staffInput({ staffIdNumber: `${prefix}-MGR` }),
    });
    expect(manager.ok).toBe(true);

    const bytes = csvFromRows([
      validRow(`${prefix}-LEAD`, {
        "First Name": "Pat",
        "Last Name": "Ng",
        Role: "Supervisor",
      }),
      validRow(`${prefix}-R1`, {
        "First Name": "Sam",
        "Last Name": "Cole",
        "Manager Staff ID": `${prefix}-LEAD`,
        "Start Date": "2026-09-01",
        "Apply Probation": "Yes",
      }),
      validRow(`${prefix}-R2`, {
        "First Name": "Riley",
        "Last Name": "Shah",
        "Manager Staff ID": `${prefix}-MGR`,
        "Start Date": "2026-09-01",
        "Apply Probation": "Yes",
        "Probation Length Days": "120",
      }),
      validRow(`${prefix}-R3`, {
        "First Name": "Jo",
        "Last Name": "Khan",
        "Start Date": "2026-09-01",
        "Apply Probation": "Yes",
        "Probation End Date": "2026-11-15",
        "Security Clearance Status": "VALID",
        "Security Clearance Expiry Date": "2027-01-01",
      }),
    ]);
    const uploaded = await createImportFromUpload(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      fileName: "staff.csv",
      bytes,
    });
    expect(uploaded.ok).toBe(true);
    if (!uploaded.ok) return;
    expect(uploaded.href).toContain("/confirm");

    const beforeUsers = await prisma.user.count({
      where: { tenantId: tenantA.tenant.id },
    });
    const confirmed = await confirmStaffImport(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      importId: uploaded.importId,
    });
    expect(confirmed.ok).toBe(true);

    const summary = await getImportSummaryForTenant(
      prisma,
      tenantA.tenant.id,
      uploaded.importId,
    );
    expect(summary.status).toBe(StaffImportStatus.COMPLETED);
    expect(summary.createdStaffCount).toBe(4);
    expect(summary.createdProbationCount).toBe(3);
    expect(summary.existingManagerMatchCount).toBe(1);
    expect(summary.importedManagerMatchCount).toBe(1);

    const report = await prisma.staff.findFirst({
      where: {
        tenantId: tenantA.tenant.id,
        staffIdNormalized: `${prefix}-r1`.toLowerCase(),
      },
      include: { manager: true, probations: true },
    });
    expect(report?.manager?.staffIdNumber).toBe(`${prefix}-LEAD`);
    expect(report?.probations[0]?.durationSource).toBe("TENANT_DEFAULT");
    expect(report?.probations[0]?.effectiveDurationDays).toBe(90);

    const override = await prisma.staff.findFirst({
      where: {
        tenantId: tenantA.tenant.id,
        staffIdNormalized: `${prefix}-r2`.toLowerCase(),
      },
      include: { manager: true, probations: true },
    });
    expect(override?.manager?.staffIdNumber).toBe(`${prefix}-MGR`);
    expect(override?.probations[0]?.durationSource).toBe("INDIVIDUAL_OVERRIDE");
    expect(override?.probations[0]?.effectiveDurationDays).toBe(120);

    const manual = await prisma.staff.findFirst({
      where: {
        tenantId: tenantA.tenant.id,
        staffIdNormalized: `${prefix}-r3`.toLowerCase(),
      },
      include: { probations: true },
    });
    expect(manual?.probations[0]?.durationSource).toBe("MANUAL_END_DATE");
    expect(manual?.securityClearanceStatus).toBe("VALID");

    const usersAfter = await prisma.user.count({
      where: { tenantId: tenantA.tenant.id },
    });
    expect(usersAfter).toBe(beforeUsers);
  });

  it("does not create staff when any row is invalid", async () => {
    const bytes = csvFromRows([
      validRow(`${prefix}-OK`),
      validRow(`${prefix}-BAD`, { "First Name": "" }),
    ]);
    const uploaded = await createImportFromUpload(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      fileName: "invalid.csv",
      bytes,
    });
    expect(uploaded.ok).toBe(true);
    if (!uploaded.ok) return;
    expect(uploaded.href).toContain("/errors");

    const confirmed = await confirmStaffImport(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      importId: uploaded.importId,
    });
    expect(confirmed.ok).toBe(false);
    expect(
      await prisma.staff.count({
        where: {
          tenantId: tenantA.tenant.id,
          staffIdNormalized: `${prefix}-ok`.toLowerCase(),
        },
      }),
    ).toBe(0);
  });

  it("allows the same staff ID in a different tenant", async () => {
    await createStaff(prisma, {
      tenantId: tenantB.tenant.id,
      userId: tenantB.user.id,
      input: staffInput({ staffIdNumber: `${prefix}-SHARED` }),
    });
    const bytes = csvFromRows([validRow(`${prefix}-SHARED`)]);
    const uploaded = await createImportFromUpload(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      fileName: "shared.csv",
      bytes,
    });
    expect(uploaded.ok).toBe(true);
    if (!uploaded.ok) return;
    const confirmed = await confirmStaffImport(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      importId: uploaded.importId,
    });
    expect(confirmed.ok).toBe(true);
    expect(
      await prisma.staff.count({
        where: { staffIdNormalized: `${prefix}-shared`.toLowerCase() },
      }),
    ).toBe(2);
  });

  it("blocks a live staff ID in the current tenant", async () => {
    await createStaff(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: staffInput({ staffIdNumber: `${prefix}-LIVE` }),
    });
    const bytes = csvFromRows([validRow(`${prefix}-LIVE`)]);
    const uploaded = await createImportFromUpload(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      fileName: "live.csv",
      bytes,
    });
    expect(uploaded.ok).toBe(true);
    if (!uploaded.ok) return;
    const summary = await getImportSummaryForTenant(
      prisma,
      tenantA.tenant.id,
      uploaded.importId,
    );
    expect(summary.status).toBe(StaffImportStatus.VALIDATION_FAILED);
  });

  it("is idempotent on final confirmation", async () => {
    const bytes = csvFromRows([validRow(`${prefix}-IDEM`)]);
    const uploaded = await createImportFromUpload(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      fileName: "idem.csv",
      bytes,
    });
    expect(uploaded.ok).toBe(true);
    if (!uploaded.ok) return;
    const first = await confirmStaffImport(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      importId: uploaded.importId,
    });
    const second = await confirmStaffImport(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      importId: uploaded.importId,
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(
      await prisma.staff.count({
        where: {
          tenantId: tenantA.tenant.id,
          staffIdNormalized: `${prefix}-idem`.toLowerCase(),
        },
      }),
    ).toBe(1);
  });

  it("does not let one tenant read or confirm another tenant's import", async () => {
    const bytes = csvFromRows([validRow(`${prefix}-PRIV`)]);
    const uploaded = await createImportFromUpload(prisma, {
      tenantId: tenantB.tenant.id,
      userId: tenantB.user.id,
      fileName: "private.csv",
      bytes,
    });
    expect(uploaded.ok).toBe(true);
    if (!uploaded.ok) return;

    await expect(
      getImportForTenant(prisma, tenantA.tenant.id, uploaded.importId),
    ).rejects.toBeInstanceOf(StaffAccessError);

    await expect(
      confirmStaffImport(prisma, {
        tenantId: tenantA.tenant.id,
        userId: tenantA.user.id,
        importId: uploaded.importId,
      }),
    ).rejects.toBeInstanceOf(StaffAccessError);

    const stillOpen = await getImportSummaryForTenant(
      prisma,
      tenantB.tenant.id,
      uploaded.importId,
    );
    expect(stillOpen.status).toBe(StaffImportStatus.AWAITING_CONFIRMATION);
    expect(
      await prisma.staff.count({
        where: {
          tenantId: tenantB.tenant.id,
          staffIdNormalized: `${prefix}-priv`.toLowerCase(),
        },
      }),
    ).toBe(0);
  });

  it("creates no import staff when a colliding ID appears before confirm", async () => {
    const bytes = csvFromRows([
      validRow(`${prefix}-ROLL1`),
      validRow(`${prefix}-ROLL2`),
    ]);
    const uploaded = await createImportFromUpload(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      fileName: "rollback.csv",
      bytes,
    });
    expect(uploaded.ok).toBe(true);
    if (!uploaded.ok) return;

    await createStaff(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: staffInput({ staffIdNumber: `${prefix}-ROLL2` }),
    });

    const result = await confirmStaffImport(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      importId: uploaded.importId,
    });
    expect(result.ok).toBe(false);
    expect(
      await prisma.staff.count({
        where: {
          tenantId: tenantA.tenant.id,
          staffIdNormalized: `${prefix}-roll1`.toLowerCase(),
        },
      }),
    ).toBe(0);
  });
});
