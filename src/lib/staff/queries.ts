import {
  EmploymentStatus,
  Prisma,
  ProbationStatus,
  SecurityClearanceStatus,
  type PrismaClient,
} from "@prisma/client";
import { londonTodayIso, parseLocalDate } from "@/lib/events/dates";
import { StaffAccessError } from "@/lib/staff/errors";
import {
  STAFF_PAGE_SIZE,
  MANAGER_SEARCH_LIMIT,
  PROBATION_QUEUE_PAGE_SIZE,
  PROBATION_REVIEW_LEAD_DAYS,
} from "@/lib/staff/catalog";
import { addCalendarDays } from "@/lib/staff/probation";
import type { StaffListQuery } from "@/lib/staff/schema";

export { STAFF_PAGE_SIZE, MANAGER_SEARCH_LIMIT };

export const staffDetailInclude = {
  manager: {
    select: {
      id: true,
      staffIdNumber: true,
      firstName: true,
      lastName: true,
      deletedAt: true,
      employmentStatus: true,
    },
  },
  probations: {
    orderBy: { createdAt: "desc" as const },
    include: {
      tasks: {
        orderBy: { dueAt: "desc" as const },
      },
    },
  },
  probationHistory: {
    orderBy: { createdAt: "desc" as const },
    include: {
      actedBy: {
        select: { firstName: true, lastName: true },
      },
    },
  },
} satisfies Prisma.StaffInclude;

export type StaffDetail = Prisma.StaffGetPayload<{
  include: typeof staffDetailInclude;
}>;

export type StaffListItem = Prisma.StaffGetPayload<{
  select: typeof staffListSelect;
}>;

const staffListSelect = {
  id: true,
  staffIdNumber: true,
  firstName: true,
  lastName: true,
  roleTitle: true,
  department: true,
  employmentStatus: true,
  probationStatus: true,
  probationEndDate: true,
  probationReviewDueDate: true,
  startDate: true,
} satisfies Prisma.StaffSelect;

export type ManagerOption = {
  id: string;
  staffIdNumber: string;
  firstName: string;
  lastName: string;
};

type DbClient = PrismaClient | Prisma.TransactionClient;

export async function getTenantProbationDefault(
  db: DbClient,
  tenantId: string,
): Promise<number> {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { defaultProbationDays: true },
  });
  return tenant?.defaultProbationDays ?? 90;
}

export async function getStaffForTenant(
  db: DbClient,
  tenantId: string,
  staffId: string,
): Promise<StaffDetail> {
  const staff = await db.staff.findFirst({
    where: { id: staffId, tenantId, deletedAt: null },
    include: staffDetailInclude,
  });
  if (!staff) {
    throw new StaffAccessError();
  }
  return staff;
}

function listWhere(
  tenantId: string,
  query: StaffListQuery,
): Prisma.StaffWhereInput {
  const search = query.q.trim();
  const today = parseLocalDate(londonTodayIso());

  let probationFilter: Prisma.StaffWhereInput = {};
  if (query.probationLifecycle === "review_due" && today) {
    probationFilter = {
      probationStatus: { in: ["IN_PROGRESS", "EXTENDED"] },
      probationReviewDueDate: { lte: today },
      probationEndDate: { gte: today },
    };
  } else if (query.probationLifecycle === "overdue" && today) {
    probationFilter = {
      probationStatus: { in: ["IN_PROGRESS", "EXTENDED"] },
      probationEndDate: { lt: today },
    };
  } else if (query.probationStatus) {
    probationFilter = {
      probationStatus: query.probationStatus as ProbationStatus,
    };
  }

  return {
    tenantId,
    deletedAt: null,
    ...(query.employmentStatus
      ? { employmentStatus: query.employmentStatus as EmploymentStatus }
      : {}),
    ...(query.department ? { department: query.department } : {}),
    ...probationFilter,
    ...(query.clearanceStatus
      ? {
          securityClearanceStatus:
            query.clearanceStatus as SecurityClearanceStatus,
        }
      : {}),
    ...(search
      ? {
          OR: [
            { staffIdNumber: { contains: search, mode: "insensitive" } },
            { firstName: { contains: search, mode: "insensitive" } },
            { lastName: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export async function listStaffForTenant(
  db: PrismaClient,
  tenantId: string,
  query: StaffListQuery,
): Promise<{
  staff: StaffListItem[];
  total: number;
  page: number;
  pageCount: number;
}> {
  const where = listWhere(tenantId, query);
  const skip = (query.page - 1) * STAFF_PAGE_SIZE;
  const [total, staff] = await Promise.all([
    db.staff.count({ where }),
    db.staff.findMany({
      where,
      select: staffListSelect,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
      skip,
      take: STAFF_PAGE_SIZE,
    }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / STAFF_PAGE_SIZE));
  const page = Math.min(query.page, pageCount);
  if (page !== query.page && total > 0) {
    const adjusted = await db.staff.findMany({
      where,
      select: staffListSelect,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
      skip: (page - 1) * STAFF_PAGE_SIZE,
      take: STAFF_PAGE_SIZE,
    });
    return { staff: adjusted, total, page, pageCount };
  }

  return { staff, total, page: query.page, pageCount };
}

export async function listDepartmentsForTenant(
  db: PrismaClient,
  tenantId: string,
): Promise<string[]> {
  const rows = await db.staff.findMany({
    where: {
      tenantId,
      deletedAt: null,
      department: { not: null },
    },
    select: { department: true },
    distinct: ["department"],
    orderBy: { department: "asc" },
  });
  return rows
    .map((row) => row.department)
    .filter((value): value is string => Boolean(value));
}

export async function searchActiveStaffForTenant(
  db: DbClient,
  tenantId: string,
  params: { q: string; excludeId?: string; limit?: number },
): Promise<ManagerOption[]> {
  const search = params.q.trim();
  const limit = params.limit ?? MANAGER_SEARCH_LIMIT;

  return db.staff.findMany({
    where: {
      tenantId,
      deletedAt: null,
      employmentStatus: EmploymentStatus.ACTIVE,
      ...(params.excludeId ? { id: { not: params.excludeId } } : {}),
      ...(search
        ? {
            OR: [
              { staffIdNumber: { contains: search, mode: "insensitive" } },
              { firstName: { contains: search, mode: "insensitive" } },
              { lastName: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      staffIdNumber: true,
      firstName: true,
      lastName: true,
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: limit,
  });
}

export async function getStaffManagerOption(
  db: DbClient,
  tenantId: string,
  staffId: string,
): Promise<ManagerOption | null> {
  const staff = await db.staff.findFirst({
    where: { id: staffId, tenantId },
    select: {
      id: true,
      staffIdNumber: true,
      firstName: true,
      lastName: true,
    },
  });
  return staff;
}

const queueStaffSelect = {
  id: true,
  status: true,
  startDate: true,
  currentEndDate: true,
  reviewDueDate: true,
  completedAt: true,
  staff: {
    select: {
      id: true,
      staffIdNumber: true,
      firstName: true,
      lastName: true,
      roleTitle: true,
      department: true,
    },
  },
  tasks: {
    where: { state: { in: ["OPEN", "ACKNOWLEDGED", "SNOOZED"] as const } },
    orderBy: { dueAt: "desc" as const },
    take: 1,
  },
} satisfies Prisma.StaffProbationSelect;

export type ProbationQueueItem = Prisma.StaffProbationGetPayload<{
  select: typeof queueStaffSelect;
}>;

async function listQueueSection(
  db: PrismaClient,
  tenantId: string,
  where: Prisma.StaffProbationWhereInput,
  orderBy: Prisma.StaffProbationOrderByWithRelationInput[],
) {
  const [total, items] = await Promise.all([
    db.staffProbation.count({ where: { tenantId, ...where } }),
    db.staffProbation.findMany({
      where: { tenantId, ...where },
      select: queueStaffSelect,
      orderBy,
      take: PROBATION_QUEUE_PAGE_SIZE,
    }),
  ]);
  return { total, items };
}

export async function listProbationQueue(
  db: PrismaClient,
  tenantId: string,
  todayIso = londonTodayIso(),
) {
  const today = parseLocalDate(todayIso);
  if (!today) {
    return {
      overdue: { total: 0, items: [] as ProbationQueueItem[] },
      reviewDue: { total: 0, items: [] as ProbationQueueItem[] },
      upcoming: { total: 0, items: [] as ProbationQueueItem[] },
    };
  }

  const upcomingUntil = addCalendarDays(today, PROBATION_REVIEW_LEAD_DAYS);
  const unresolved = {
    completedAt: null,
    status: { in: ["IN_PROGRESS" as const, "EXTENDED" as const] },
  };

  const [overdue, reviewDue, upcoming] = await Promise.all([
    listQueueSection(
      db,
      tenantId,
      { ...unresolved, currentEndDate: { lt: today } },
      [{ currentEndDate: "asc" }, { staff: { lastName: "asc" } }],
    ),
    listQueueSection(
      db,
      tenantId,
      {
        ...unresolved,
        reviewDueDate: { lte: today },
        currentEndDate: { gte: today },
      },
      [{ reviewDueDate: "asc" }, { staff: { lastName: "asc" } }],
    ),
    listQueueSection(
      db,
      tenantId,
      {
        ...unresolved,
        reviewDueDate: { gt: today, lte: upcomingUntil },
      },
      [{ reviewDueDate: "asc" }, { staff: { lastName: "asc" } }],
    ),
  ]);

  return { overdue, reviewDue, upcoming, todayIso };
}

export function currentProbation(staff: StaffDetail) {
  return (
    staff.probations.find((row) => row.completedAt === null) ??
    staff.probations[0] ??
    null
  );
}

export function currentOpenTask(staff: StaffDetail) {
  const probation = currentProbation(staff);
  if (!probation) return null;
  const open = probation.tasks.filter(
    (task) =>
      task.state === "OPEN" ||
      task.state === "ACKNOWLEDGED" ||
      task.state === "SNOOZED",
  );
  if (open.length === 0) return null;
  return (
    open.find((task) => task.type === "OVERDUE_ESCALATION") ?? open[0] ?? null
  );
}
