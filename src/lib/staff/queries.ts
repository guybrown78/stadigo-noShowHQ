import {
  EmploymentStatus,
  Prisma,
  ProbationStatus,
  SecurityClearanceStatus,
  type PrismaClient,
} from "@prisma/client";
import { StaffAccessError } from "@/lib/staff/errors";
import { STAFF_PAGE_SIZE, MANAGER_SEARCH_LIMIT } from "@/lib/staff/catalog";
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

  return {
    tenantId,
    deletedAt: null,
    ...(query.employmentStatus
      ? { employmentStatus: query.employmentStatus as EmploymentStatus }
      : {}),
    ...(query.department ? { department: query.department } : {}),
    ...(query.probationStatus
      ? { probationStatus: query.probationStatus as ProbationStatus }
      : {}),
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
