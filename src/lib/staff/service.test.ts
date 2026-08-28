import { Role } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { formatLocalDateIso } from "@/lib/events/dates";
import { StaffAccessError } from "@/lib/staff/errors";
import {
  getStaffForTenant,
  listStaffForTenant,
} from "@/lib/staff/queries";
import type { StaffInput } from "@/lib/staff/schema";
import { createStaff, deleteStaff, updateStaff } from "@/lib/staff/service";

const prefix = `vitest-staff-${Date.now()}`;

type Fixture = {
  tenant: { id: string; name: string; slug: string };
  user: { id: string };
};

let tenantA: Fixture;
let tenantB: Fixture;

async function createFixture(label: string): Promise<Fixture> {
  const tenant = await prisma.tenant.create({
    data: {
      name: `Vitest ${label}`,
      slug: `${prefix}-${label}`.toLowerCase(),
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

function inputFor(overrides: Partial<StaffInput> = {}): StaffInput {
  return {
    staffIdNumber: "ST-1001",
    firstName: "Alex",
    lastName: "Patel",
    email: null,
    phone: null,
    department: null,
    roleTitle: "Steward",
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

async function emptyListQuery() {
  return {
    q: "",
    employmentStatus: "",
    department: "",
    probationStatus: "",
    probationLifecycle: "",
    clearanceStatus: "",
    page: 1,
  } as const;
}

beforeAll(async () => {
  tenantA = await createFixture("a");
  tenantB = await createFixture("b");
});

afterAll(async () => {
  const tenantIds = [tenantA?.tenant.id, tenantB?.tenant.id].filter(Boolean);
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
  await prisma.tenant.updateMany({
    where: { id: { in: tenantIds } },
    data: { defaultProbationUpdatedById: null },
  });
  await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  await prisma.$disconnect();
});

describe("staff service", () => {
  it("creates a valid staff record without a login account", async () => {
    const usersBefore = await prisma.user.count({
      where: { tenantId: tenantA.tenant.id },
    });
    const result = await createStaff(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: inputFor({ staffIdNumber: "ST-CREATE" }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const staff = await getStaffForTenant(
      prisma,
      tenantA.tenant.id,
      result.id,
    );
    expect(staff.tenantId).toBe(tenantA.tenant.id);
    expect(staff.staffIdNumber).toBe("ST-CREATE");
    expect(staff.staffIdNormalized).toBe("st-create");
    expect(staff.firstName).toBe("Alex");
    expect(staff.roleTitle).toBe("Steward");
    expect(staff.createdById).toBe(tenantA.user.id);
    expect(staff.employmentStatus).toBe("ACTIVE");

    const usersAfter = await prisma.user.count({
      where: { tenantId: tenantA.tenant.id },
    });
    expect(usersAfter).toBe(usersBefore);
  });

  it("rejects a duplicate staff ID in the same tenant, including case", async () => {
    const first = await createStaff(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: inputFor({ staffIdNumber: "ST-DUP" }),
    });
    expect(first.ok).toBe(true);

    const second = await createStaff(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: inputFor({
        staffIdNumber: "st-dup",
        firstName: "Jordan",
      }),
    });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.fieldErrors?.staffIdNumber?.[0]).toMatch(/already used/i);
    }

    const retries = await prisma.staff.count({
      where: {
        tenantId: tenantA.tenant.id,
        staffIdNormalized: "st-dup",
        deletedAt: null,
      },
    });
    expect(retries).toBe(1);
  });

  it("rejects a second insert of the same live staff ID at the database", async () => {
    const created = await createStaff(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: inputFor({ staffIdNumber: "ST-IDX" }),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await expect(
      prisma.staff.create({
        data: {
          tenantId: tenantA.tenant.id,
          staffIdNumber: "st-idx",
          staffIdNormalized: "st-idx",
          firstName: "Other",
          lastName: "Person",
          roleTitle: "Steward",
          createdById: tenantA.user.id,
          updatedById: tenantA.user.id,
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("does not let createStaff skip mandatory fields", async () => {
    const result = await createStaff(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: inputFor({ staffIdNumber: "ST-EMPTY", firstName: "   " }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors?.firstName).toBeTruthy();
    }

    const clearance = await createStaff(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: inputFor({
        staffIdNumber: "ST-CLR-REQ",
        securityClearanceStatus: "VALID",
        securityClearanceExpiryDate: null,
      }),
    });
    expect(clearance.ok).toBe(false);
    if (!clearance.ok) {
      expect(clearance.fieldErrors?.securityClearanceExpiryDate).toBeTruthy();
    }
  });

  it("allows the same staff ID in a different tenant", async () => {
    const inA = await createStaff(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: inputFor({ staffIdNumber: "ST-SHARED" }),
    });
    expect(inA.ok).toBe(true);

    const inB = await createStaff(prisma, {
      tenantId: tenantB.tenant.id,
      userId: tenantB.user.id,
      input: inputFor({ staffIdNumber: "ST-SHARED" }),
    });
    expect(inB.ok).toBe(true);
  });

  it("searches by staff ID and name within the tenant", async () => {
    await createStaff(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: inputFor({
        staffIdNumber: "SEC-44",
        firstName: "Morgan",
        lastName: "Okafor",
        roleTitle: "Supervisor",
      }),
    });
    await createStaff(prisma, {
      tenantId: tenantB.tenant.id,
      userId: tenantB.user.id,
      input: inputFor({
        staffIdNumber: "SEC-44B",
        firstName: "Morgan",
        lastName: "Okafor",
      }),
    });

    const byId = await listStaffForTenant(prisma, tenantA.tenant.id, {
      ...(await emptyListQuery()),
      q: "sec-4",
    });
    expect(byId.staff.some((row) => row.staffIdNumber === "SEC-44")).toBe(true);
    expect(byId.staff.every((row) => row.staffIdNumber !== "SEC-44B")).toBe(
      true,
    );

    const byName = await listStaffForTenant(prisma, tenantA.tenant.id, {
      ...(await emptyListQuery()),
      q: "okaf",
    });
    expect(byName.staff.some((row) => row.lastName === "Okafor")).toBe(true);
  });

  it("rejects a manager from another tenant, a deleted manager, and self", async () => {
    const other = await createStaff(prisma, {
      tenantId: tenantB.tenant.id,
      userId: tenantB.user.id,
      input: inputFor({ staffIdNumber: "MGR-B" }),
    });
    expect(other.ok).toBe(true);
    if (!other.ok) return;

    const cross = await createStaff(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: inputFor({
        staffIdNumber: "ST-XMAN",
        managerStaffId: other.id,
      }),
    });
    expect(cross.ok).toBe(false);

    const localManager = await createStaff(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: inputFor({ staffIdNumber: "MGR-DEL" }),
    });
    expect(localManager.ok).toBe(true);
    if (!localManager.ok) return;

    await deleteStaff(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      staffId: localManager.id,
    });

    const deletedManager = await createStaff(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: inputFor({
        staffIdNumber: "ST-DELMAN",
        managerStaffId: localManager.id,
      }),
    });
    expect(deletedManager.ok).toBe(false);

    const selfCreate = await createStaff(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: inputFor({ staffIdNumber: "ST-SELF" }),
    });
    expect(selfCreate.ok).toBe(true);
    if (!selfCreate.ok) return;

    const selfUpdate = await updateStaff(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      staffId: selfCreate.id,
      input: inputFor({
        staffIdNumber: "ST-SELF",
        managerStaffId: selfCreate.id,
      }),
    });
    expect(selfUpdate.ok).toBe(false);
    if (!selfUpdate.ok) {
      expect(selfUpdate.fieldErrors?.managerStaffId?.[0]).toMatch(/own manager/i);
    }
  });

  it("prevents a manager reporting cycle", async () => {
    const lead = await createStaff(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: inputFor({ staffIdNumber: "CYC-LEAD", firstName: "Lead" }),
    });
    expect(lead.ok).toBe(true);
    if (!lead.ok) return;

    const report = await createStaff(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: inputFor({
        staffIdNumber: "CYC-REP",
        firstName: "Report",
        managerStaffId: lead.id,
      }),
    });
    expect(report.ok).toBe(true);
    if (!report.ok) return;

    const cycle = await updateStaff(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      staffId: lead.id,
      input: inputFor({
        staffIdNumber: "CYC-LEAD",
        firstName: "Lead",
        managerStaffId: report.id,
      }),
    });
    expect(cycle.ok).toBe(false);
    if (!cycle.ok) {
      expect(cycle.fieldErrors?.managerStaffId?.[0]).toMatch(/cycle/i);
    }
  });

  it("calculates probation fields and writes history", async () => {
    const created = await createStaff(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: inputFor({
        staffIdNumber: "PRB-1",
        startDate: "2026-01-01",
        applyProbation: true,
        probationStatus: "IN_PROGRESS",
      }),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const staff = await getStaffForTenant(
      prisma,
      tenantA.tenant.id,
      created.id,
    );
    expect(staff.probationStatus).toBe("IN_PROGRESS");
    expect(staff.probationLengthDays).toBe(90);
    expect(staff.probationEndDate).not.toBeNull();
    expect(formatLocalDateIso(staff.probationEndDate!)).toBe("2026-04-01");
    expect(formatLocalDateIso(staff.probationReviewDueDate!)).toBe("2026-03-04");
    expect(staff.probationHistory.some((entry) => entry.action === "STARTED")).toBe(
      true,
    );
    expect(staff.probations[0]?.durationSource).toBe("TENANT_DEFAULT");
  });

  it("stores date-only fields as UTC midnight without shifting the calendar day", async () => {
    const created = await createStaff(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: inputFor({
        staffIdNumber: "DATE-1",
        startDate: "2026-01-15",
        applyProbation: true,
        probationStatus: "IN_PROGRESS",
        securityClearanceStatus: "VALID",
        securityClearanceExpiryDate: "2027-06-30",
      }),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const staff = await getStaffForTenant(
      prisma,
      tenantA.tenant.id,
      created.id,
    );
    expect(staff.startDate?.toISOString()).toBe("2026-01-15T00:00:00.000Z");
    expect(formatLocalDateIso(staff.startDate!)).toBe("2026-01-15");
    expect(formatLocalDateIso(staff.probationEndDate!)).toBe("2026-04-15");
    expect(formatLocalDateIso(staff.probationReviewDueDate!)).toBe("2026-03-18");
    expect(formatLocalDateIso(staff.securityClearanceExpiryDate!)).toBe(
      "2027-06-30",
    );
    expect(staff.securityClearanceExpiryDate?.toISOString()).toBe(
      "2027-06-30T00:00:00.000Z",
    );
    expect(formatLocalDateIso(staff.probations[0]!.startDate)).toBe("2026-01-15");
    expect(formatLocalDateIso(staff.probations[0]!.currentEndDate)).toBe(
      "2026-04-15",
    );
  });

  it("logically deletes staff and hides them from list and get", async () => {
    const created = await createStaff(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: inputFor({ staffIdNumber: "DEL-1", lastName: "ToDelete" }),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await deleteStaff(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      staffId: created.id,
    });

    const stored = await prisma.staff.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(stored.deletedAt).not.toBeNull();
    expect(stored.deletedById).toBe(tenantA.user.id);

    await expect(
      getStaffForTenant(prisma, tenantA.tenant.id, created.id),
    ).rejects.toBeInstanceOf(StaffAccessError);

    const list = await listStaffForTenant(prisma, tenantA.tenant.id, {
      ...(await emptyListQuery()),
      q: "ToDelete",
    });
    expect(list.staff.some((row) => row.id === created.id)).toBe(false);

    const reuse = await createStaff(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: inputFor({ staffIdNumber: "DEL-1", firstName: "Reused" }),
    });
    expect(reuse.ok).toBe(true);
  });

  it("does not let one tenant read, update or delete another tenant's staff", async () => {
    const created = await createStaff(prisma, {
      tenantId: tenantB.tenant.id,
      userId: tenantB.user.id,
      input: inputFor({ staffIdNumber: "PRIV-B", firstName: "Private" }),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await expect(
      getStaffForTenant(prisma, tenantA.tenant.id, created.id),
    ).rejects.toBeInstanceOf(StaffAccessError);

    await expect(
      updateStaff(prisma, {
        tenantId: tenantA.tenant.id,
        userId: tenantA.user.id,
        staffId: created.id,
        input: inputFor({ staffIdNumber: "HIJACK", firstName: "Hijacked" }),
      }),
    ).rejects.toBeInstanceOf(StaffAccessError);

    await expect(
      deleteStaff(prisma, {
        tenantId: tenantA.tenant.id,
        userId: tenantA.user.id,
        staffId: created.id,
      }),
    ).rejects.toBeInstanceOf(StaffAccessError);

    const original = await getStaffForTenant(
      prisma,
      tenantB.tenant.id,
      created.id,
    );
    expect(original.firstName).toBe("Private");
    expect(original.deletedAt).toBeNull();
  });
});
