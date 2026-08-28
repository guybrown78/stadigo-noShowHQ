import { Role } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { formatLocalDateIso, londonTodayIso, parseLocalDate } from "@/lib/events/dates";
import { StaffAccessError } from "@/lib/staff/errors";
import {
  getStaffForTenant,
} from "@/lib/staff/queries";
import {
  amendProbationEndDate,
  restartStaffProbation,
  reviewStaffProbation,
} from "@/lib/staff/probation-service";
import { reconcileLegacyProbations } from "@/lib/staff/reconcile-legacy";
import type { StaffInput } from "@/lib/staff/schema";
import { createStaff, updateStaff } from "@/lib/staff/service";
import {
  updateTenantProbationDefault,
} from "@/lib/staff/settings";
import {
  acknowledgeProbationTask,
  countOpenProbationTasks,
  expectedTaskSpecs,
  reconcileProbation,
  snoozeProbationTask,
} from "@/lib/staff/tasks";

const prefix = `vitest-prb-${Date.now()}`;

type Fixture = {
  tenant: { id: string };
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
    startDate: "2026-06-01",
    applyProbation: true,
    probationLengthDays: null,
    overrideProbationEndDate: false,
    probationEndDate: null,
    probationStatus: "IN_PROGRESS",
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
  await prisma.staffProbationTask.deleteMany({
    where: { tenantId: { in: [tenantA.tenant.id, tenantB.tenant.id] } },
  });
  await prisma.staffProbationHistory.deleteMany({
    where: { tenantId: { in: [tenantA.tenant.id, tenantB.tenant.id] } },
  });
  await prisma.staffProbation.deleteMany({
    where: { tenantId: { in: [tenantA.tenant.id, tenantB.tenant.id] } },
  });
  await prisma.staff.deleteMany({
    where: { tenantId: { in: [tenantA.tenant.id, tenantB.tenant.id] } },
  });
  await prisma.tenant.updateMany({
    where: { id: { in: [tenantA.tenant.id, tenantB.tenant.id] } },
    data: { defaultProbationUpdatedById: null },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [tenantA.user.id, tenantB.user.id] } },
  });
  await prisma.tenant.deleteMany({
    where: { id: { in: [tenantA.tenant.id, tenantB.tenant.id] } },
  });
  await prisma.$disconnect();
});

describe("probation workflow", () => {
  it("rejects invalid tenant default lengths", async () => {
    const result = await updateTenantProbationDefault(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      days: 0,
    });
    expect(result.ok).toBe(false);
  });

  it("snapshots the tenant default and does not rewrite existing dates", async () => {
    const created = await createStaff(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: inputFor({ staffIdNumber: "SNAP-1" }),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const before = await getStaffForTenant(
      prisma,
      tenantA.tenant.id,
      created.id,
    );
    expect(before.probationLengthDays).toBe(90);
    expect(formatLocalDateIso(before.probationEndDate!)).toBe("2026-08-30");

    const updated = await updateTenantProbationDefault(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      days: 30,
    });
    expect(updated.ok).toBe(true);

    const after = await getStaffForTenant(
      prisma,
      tenantA.tenant.id,
      created.id,
    );
    expect(after.probationLengthDays).toBe(90);
    expect(formatLocalDateIso(after.probationEndDate!)).toBe("2026-08-30");
    expect(after.probations[0]?.effectiveDurationDays).toBe(90);

    const next = await createStaff(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: inputFor({ staffIdNumber: "SNAP-2", startDate: "2026-06-01" }),
    });
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    const newer = await getStaffForTenant(prisma, tenantA.tenant.id, next.id);
    expect(newer.probationLengthDays).toBe(30);
    expect(formatLocalDateIso(newer.probationEndDate!)).toBe("2026-07-01");

    await updateTenantProbationDefault(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      days: 90,
    });
  });

  it("cannot pass or extend probation through the staff form", async () => {
    const created = await createStaff(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: inputFor({ staffIdNumber: "FORM-1" }),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const updated = await updateStaff(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      staffId: created.id,
      input: inputFor({
        staffIdNumber: "FORM-1",
        applyProbation: true,
        probationStatus: "PASSED",
      }),
    });
    expect(updated.ok).toBe(true);

    const staff = await getStaffForTenant(
      prisma,
      tenantA.tenant.id,
      created.id,
    );
    expect(staff.probationStatus).toBe("IN_PROGRESS");
    expect(staff.probationHistory.some((entry) => entry.action === "PASSED")).toBe(
      false,
    );
  });

  it("records pass, extension, and not continued with history", async () => {
    const created = await createStaff(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: inputFor({ staffIdNumber: "DEC-1" }),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const firstExtend = await reviewStaffProbation(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      staffId: created.id,
      outcome: "EXTENDED",
      reviewDate: "2026-08-01",
      notes: "Need more observation",
      newEndDate: "2026-10-01",
    });
    expect(firstExtend.ok).toBe(true);

    const secondExtend = await reviewStaffProbation(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      staffId: created.id,
      outcome: "EXTENDED",
      reviewDate: "2026-08-15",
      notes: "Second extension",
      newEndDate: "2026-11-01",
    });
    expect(secondExtend.ok).toBe(true);

    const afterExtend = await getStaffForTenant(
      prisma,
      tenantA.tenant.id,
      created.id,
    );
    expect(afterExtend.probationStatus).toBe("EXTENDED");
    expect(formatLocalDateIso(afterExtend.probationEndDate!)).toBe("2026-11-01");
    expect(
      afterExtend.probationHistory.filter((entry) => entry.action === "EXTENDED")
        .length,
    ).toBe(2);
    expect(afterExtend.employmentStatus).toBe("ACTIVE");

    const passed = await createStaff(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: inputFor({ staffIdNumber: "DEC-2" }),
    });
    expect(passed.ok).toBe(true);
    if (!passed.ok) return;
    const passResult = await reviewStaffProbation(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      staffId: passed.id,
      outcome: "PASSED",
      reviewDate: "2026-08-20",
      notes: null,
      newEndDate: null,
    });
    expect(passResult.ok).toBe(true);
    const afterPass = await getStaffForTenant(
      prisma,
      tenantA.tenant.id,
      passed.id,
    );
    expect(afterPass.probationStatus).toBe("PASSED");
    expect(afterPass.probations[0]?.completedAt).not.toBeNull();

    const stopped = await createStaff(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: inputFor({ staffIdNumber: "DEC-3" }),
    });
    expect(stopped.ok).toBe(true);
    if (!stopped.ok) return;
    const stopResult = await reviewStaffProbation(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      staffId: stopped.id,
      outcome: "NOT_CONTINUED",
      reviewDate: "2026-08-20",
      notes: "Not meeting the standard",
      newEndDate: null,
    });
    expect(stopResult.ok).toBe(true);
    const afterStop = await getStaffForTenant(
      prisma,
      tenantA.tenant.id,
      stopped.id,
    );
    expect(afterStop.probationStatus).toBe("NOT_CONTINUED");
    expect(afterStop.employmentStatus).toBe("ACTIVE");
    expect(afterStop.deletedAt).toBeNull();
  });

  it("restarts a new cycle after passed or not continued", async () => {
    const created = await createStaff(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: inputFor({ staffIdNumber: "RST-1" }),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const whileActive = await restartStaffProbation(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      staffId: created.id,
    });
    expect(whileActive.ok).toBe(false);

    const passed = await reviewStaffProbation(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      staffId: created.id,
      outcome: "PASSED",
      reviewDate: "2026-08-20",
      notes: null,
      newEndDate: null,
    });
    expect(passed.ok).toBe(true);

    await updateTenantProbationDefault(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      days: 60,
    });

    const restarted = await restartStaffProbation(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      staffId: created.id,
    });
    expect(restarted.ok).toBe(true);

    const after = await getStaffForTenant(
      prisma,
      tenantA.tenant.id,
      created.id,
    );
    expect(after.probationStatus).toBe("IN_PROGRESS");
    expect(after.employmentStatus).toBe("ACTIVE");
    expect(after.probations).toHaveLength(2);
    const open = after.probations.find((row) => row.completedAt === null);
    const closed = after.probations.find((row) => row.status === "PASSED");
    expect(open?.status).toBe("IN_PROGRESS");
    expect(formatLocalDateIso(open!.startDate)).toBe(londonTodayIso());
    expect(open!.effectiveDurationDays).toBe(60);
    expect(closed?.completedAt).not.toBeNull();
    expect(
      after.probationHistory.filter((entry) => entry.action === "STARTED")
        .length,
    ).toBe(2);

    await expect(
      restartStaffProbation(prisma, {
        tenantId: tenantB.tenant.id,
        userId: tenantB.user.id,
        staffId: created.id,
      }),
    ).rejects.toBeInstanceOf(StaffAccessError);

    await updateTenantProbationDefault(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      days: 90,
    });
  });

  it("is idempotent for task cadence and blocks overdue snooze", async () => {
    const created = await createStaff(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: inputFor({
        staffIdNumber: "TASK-1",
        startDate: "2026-01-01",
      }),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const staff = await getStaffForTenant(
      prisma,
      tenantA.tenant.id,
      created.id,
    );
    const probationId = staff.probations[0]!.id;
    await reconcileProbation(prisma, {
      tenantId: tenantA.tenant.id,
      probationId,
      todayIso: "2026-04-16",
    });
    const second = await reconcileProbation(prisma, {
      tenantId: tenantA.tenant.id,
      probationId,
      todayIso: "2026-04-16",
    });
    expect(second).toBe(0);
    const expected = expectedTaskSpecs(
      parseLocalDate("2026-03-04")!,
      parseLocalDate("2026-04-01")!,
      "2026-04-16",
    );
    const tasks = await prisma.staffProbationTask.findMany({
      where: { probationId },
    });
    expect(tasks.length).toBeGreaterThanOrEqual(expected.length);
    const actionable = tasks.filter(
      (task) =>
        task.state === "OPEN" ||
        task.state === "ACKNOWLEDGED" ||
        task.state === "SNOOZED",
    );
    expect(actionable).toHaveLength(1);
    expect(actionable[0]?.type).toBe("OVERDUE_ESCALATION");

    const history = await prisma.staffProbationHistory.findMany({
      where: { probationId },
    });
    expect(history.some((entry) => entry.action === "REVIEW_DUE")).toBe(true);
    expect(history.some((entry) => entry.action === "REMINDER_CREATED")).toBe(
      true,
    );
    expect(history.some((entry) => entry.action === "OVERDUE_ESCALATED")).toBe(
      true,
    );

    const openTask = actionable[0];
    expect(openTask).toBeTruthy();
    if (!openTask) return;

    const ack = await acknowledgeProbationTask(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      taskId: openTask.id,
    });
    expect(ack.ok).toBe(true);

    const snooze = await snoozeProbationTask(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      taskId: openTask.id,
      snoozedUntil: "2026-04-20",
      reason: "Waiting for a manager",
      todayIso: "2026-04-16",
    });
    expect(snooze.ok).toBe(false);
  });

  it("keeps one open task as cadence advances and counts people not chases", async () => {
    const beforeCount = await countOpenProbationTasks(
      prisma,
      tenantA.tenant.id,
      "2026-03-18",
    );
    const firstStaff = await createStaff(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: inputFor({
        staffIdNumber: "TASK-2",
        startDate: "2026-01-01",
      }),
    });
    const secondStaff = await createStaff(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: inputFor({
        staffIdNumber: "TASK-3",
        firstName: "Blair",
        startDate: "2026-01-01",
      }),
    });
    expect(firstStaff.ok).toBe(true);
    expect(secondStaff.ok).toBe(true);
    if (!firstStaff.ok || !secondStaff.ok) return;

    const firstRecord = await getStaffForTenant(
      prisma,
      tenantA.tenant.id,
      firstStaff.id,
    );
    const probationId = firstRecord.probations[0]!.id;

    await reconcileProbation(prisma, {
      tenantId: tenantA.tenant.id,
      probationId,
      todayIso: "2026-03-04",
    });
    let tasks = await prisma.staffProbationTask.findMany({
      where: { probationId },
    });
    expect(
      tasks.filter((task) => task.state === "OPEN").map((task) => task.cadenceKey),
    ).toEqual(["review-due:2026-03-04"]);

    await reconcileProbation(prisma, {
      tenantId: tenantA.tenant.id,
      probationId,
      todayIso: "2026-03-18",
    });
    tasks = await prisma.staffProbationTask.findMany({
      where: { probationId },
    });
    const actionable = tasks.filter(
      (task) =>
        task.state === "OPEN" ||
        task.state === "ACKNOWLEDGED" ||
        task.state === "SNOOZED",
    );
    expect(actionable).toHaveLength(1);
    expect(actionable[0]?.cadenceKey).toBe("chase:2026-03-18");
    expect(
      tasks.find((task) => task.cadenceKey === "review-due:2026-03-04")?.state,
    ).toBe("CANCELLED");
    expect(
      tasks.find((task) => task.cadenceKey === "chase:2026-03-11")?.state,
    ).toBe("CANCELLED");

    const secondRecord = await getStaffForTenant(
      prisma,
      tenantA.tenant.id,
      secondStaff.id,
    );
    await reconcileProbation(prisma, {
      tenantId: tenantA.tenant.id,
      probationId: secondRecord.probations[0]!.id,
      todayIso: "2026-03-18",
    });

    const count = await countOpenProbationTasks(
      prisma,
      tenantA.tenant.id,
      "2026-03-18",
    );
    expect(count).toBe(beforeCount + 2);

    const extended = await reviewStaffProbation(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      staffId: firstStaff.id,
      outcome: "EXTENDED",
      reviewDate: "2026-03-18",
      notes: "Need more observation",
      newEndDate: "2026-11-01",
    });
    expect(extended.ok).toBe(true);
    const afterExtend = await prisma.staffProbationTask.findMany({
      where: { probationId },
    });
    expect(
      afterExtend.filter(
        (task) =>
          task.state === "OPEN" ||
          task.state === "ACKNOWLEDGED" ||
          task.state === "SNOOZED",
      ),
    ).toHaveLength(0);
    const afterStaff = await getStaffForTenant(
      prisma,
      tenantA.tenant.id,
      firstStaff.id,
    );
    expect(
      afterStaff.probationHistory.some((entry) => entry.action === "EXTENDED"),
    ).toBe(true);
    expect(
      afterStaff.probationHistory.some((entry) => entry.action === "REVIEW_DUE"),
    ).toBe(true);

    const passed = await reviewStaffProbation(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      staffId: secondStaff.id,
      outcome: "PASSED",
      reviewDate: "2026-03-18",
      notes: null,
      newEndDate: null,
    });
    expect(passed.ok).toBe(true);
    const afterPass = await prisma.staffProbationTask.findMany({
      where: { probationId: secondRecord.probations[0]!.id },
    });
    expect(
      afterPass.filter(
        (task) =>
          task.state === "OPEN" ||
          task.state === "ACKNOWLEDGED" ||
          task.state === "SNOOZED",
      ),
    ).toHaveLength(0);
  });

  it("amends an end date with a reason and rejects cross-tenant access", async () => {
    const created = await createStaff(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      input: inputFor({ staffIdNumber: "AMD-1" }),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const amended = await amendProbationEndDate(prisma, {
      tenantId: tenantA.tenant.id,
      userId: tenantA.user.id,
      staffId: created.id,
      newEndDate: "2026-12-01",
      reason: "Contract confirmed later",
    });
    expect(amended.ok).toBe(true);

    await expect(
      reviewStaffProbation(prisma, {
        tenantId: tenantB.tenant.id,
        userId: tenantB.user.id,
        staffId: created.id,
        outcome: "PASSED",
        reviewDate: "2026-08-20",
        notes: null,
        newEndDate: null,
      }),
    ).rejects.toBeInstanceOf(StaffAccessError);

    await expect(
      updateTenantProbationDefault(prisma, {
        tenantId: tenantB.tenant.id + "missing",
        userId: tenantB.user.id,
        days: 60,
      }),
    ).rejects.toBeInstanceOf(StaffAccessError);
  });

  it("reconciles legacy staff without inventing an outcome", async () => {
    const staff = await prisma.staff.create({
      data: {
        tenantId: tenantA.tenant.id,
        staffIdNumber: "LEG-1",
        staffIdNormalized: "leg-1",
        firstName: "Legacy",
        lastName: "Row",
        roleTitle: "Steward",
        employmentStatus: "ACTIVE",
        startDate: parseLocalDate("2026-01-01"),
        probationEndDate: parseLocalDate("2026-02-01"),
        probationReviewDueDate: parseLocalDate("2026-01-04"),
        probationStatus: "IN_PROGRESS",
        createdById: tenantA.user.id,
        updatedById: tenantA.user.id,
      },
    });

    const result = await reconcileLegacyProbations(prisma, tenantA.tenant.id);
    expect(result.created).toBeGreaterThanOrEqual(1);

    const again = await reconcileLegacyProbations(prisma, tenantA.tenant.id);
    expect(again.created).toBe(0);

    const loaded = await getStaffForTenant(
      prisma,
      tenantA.tenant.id,
      staff.id,
    );
    expect(loaded.probationStatus).toBe("IN_PROGRESS");
    expect(formatLocalDateIso(loaded.probationEndDate!)).toBe("2026-02-01");
    expect(
      loaded.probationHistory.some((entry) => entry.action === "LEGACY_RECONCILED"),
    ).toBe(true);
    expect(loaded.probations[0]?.completedAt).toBeNull();
  });
});
