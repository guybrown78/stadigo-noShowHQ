import {
  StaffImportStatus,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";
import { StaffAccessError } from "@/lib/staff/errors";
import { IMPORT_PREVIEW_PAGE_SIZE } from "@/lib/staff/import/constants";
import type {
  FieldErrors,
  ImportRowNormalized,
  ImportRowRaw,
  ManagerOutcome,
  ProbationPreview,
} from "@/lib/staff/import/types";

type DbClient = PrismaClient | Prisma.TransactionClient;

export const importDetailInclude = {
  rows: {
    orderBy: { sourceRowNumber: "asc" as const },
  },
} satisfies Prisma.StaffImportInclude;

export type StaffImportDetail = Prisma.StaffImportGetPayload<{
  include: typeof importDetailInclude;
}>;

export async function getImportForTenant(
  db: DbClient,
  tenantId: string,
  importId: string,
): Promise<StaffImportDetail> {
  const record = await db.staffImport.findFirst({
    where: { id: importId, tenantId },
    include: importDetailInclude,
  });
  if (!record) {
    throw new StaffAccessError();
  }
  return record;
}

export async function getImportSummaryForTenant(
  db: DbClient,
  tenantId: string,
  importId: string,
) {
  const record = await db.staffImport.findFirst({
    where: { id: importId, tenantId },
  });
  if (!record) {
    throw new StaffAccessError();
  }
  return record;
}

export function parseRowRaw(value: Prisma.JsonValue): ImportRowRaw {
  return value as ImportRowRaw;
}

export function parseRowNormalized(
  value: Prisma.JsonValue | null,
): ImportRowNormalized | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as ImportRowNormalized;
}

export function parseFieldErrors(value: Prisma.JsonValue | null): FieldErrors {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as FieldErrors;
}

export function parseManagerOutcome(
  value: Prisma.JsonValue | null,
): ManagerOutcome | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as ManagerOutcome;
}

export function parseProbationPreview(
  value: Prisma.JsonValue | null,
): ProbationPreview | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as ProbationPreview;
}

export async function listInvalidImportRows(
  db: DbClient,
  tenantId: string,
  importId: string,
  query: { q: string; page: number },
) {
  const where: Prisma.StaffImportRowWhereInput = {
    importId,
    tenantId,
    status: "INVALID",
  };
  const rows = await db.staffImportRow.findMany({
    where,
    orderBy: { sourceRowNumber: "asc" },
  });
  const needle = query.q.trim().toLowerCase();
  const filtered = needle
    ? rows.filter((row) => {
        if (String(row.sourceRowNumber).includes(needle)) {
          return true;
        }
        const raw = JSON.stringify(row.raw).toLowerCase();
        const errors = JSON.stringify(row.fieldErrors ?? {}).toLowerCase();
        return raw.includes(needle) || errors.includes(needle);
      })
    : rows;
  const pageCount = Math.max(
    1,
    Math.ceil(filtered.length / IMPORT_PREVIEW_PAGE_SIZE),
  );
  const page = Math.min(query.page, pageCount);
  const start = (page - 1) * IMPORT_PREVIEW_PAGE_SIZE;
  const duplicateStaffIdCount = rows.filter((row) => {
    const errors = parseFieldErrors(row.fieldErrors);
    return errors.staffIdNumber?.some((message) =>
      /already used|more than once/i.test(message),
    );
  }).length;
  return {
    rows: filtered.slice(start, start + IMPORT_PREVIEW_PAGE_SIZE),
    total: filtered.length,
    page,
    pageCount,
    duplicateStaffIdCount,
  };
}

export async function listValidImportPreview(
  db: DbClient,
  tenantId: string,
  importId: string,
  page: number,
) {
  const where: Prisma.StaffImportRowWhereInput = {
    importId,
    tenantId,
    status: "VALID",
  };
  const [rows, total] = await Promise.all([
    db.staffImportRow.findMany({
      where,
      orderBy: { sourceRowNumber: "asc" },
      skip: (page - 1) * IMPORT_PREVIEW_PAGE_SIZE,
      take: IMPORT_PREVIEW_PAGE_SIZE,
    }),
    db.staffImportRow.count({ where }),
  ]);
  return {
    rows,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / IMPORT_PREVIEW_PAGE_SIZE)),
  };
}

export async function listCreatedImportRows(
  db: DbClient,
  tenantId: string,
  importId: string,
  page: number,
) {
  const where: Prisma.StaffImportRowWhereInput = {
    importId,
    tenantId,
    createdStaffId: { not: null },
  };
  const [rows, total] = await Promise.all([
    db.staffImportRow.findMany({
      where,
      orderBy: { sourceRowNumber: "asc" },
      skip: (page - 1) * IMPORT_PREVIEW_PAGE_SIZE,
      take: IMPORT_PREVIEW_PAGE_SIZE,
      include: {
        createdStaff: {
          select: {
            id: true,
            staffIdNumber: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    }),
    db.staffImportRow.count({ where }),
  ]);
  return {
    rows,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / IMPORT_PREVIEW_PAGE_SIZE)),
  };
}

export async function listAllImportRowsForReport(
  db: DbClient,
  tenantId: string,
  importId: string,
) {
  return db.staffImportRow.findMany({
    where: { importId, tenantId, status: { not: "IGNORED" } },
    orderBy: { sourceRowNumber: "asc" },
  });
}

export function importStatusPath(
  status: StaffImportStatus,
  importId: string,
): string {
  switch (status) {
    case StaffImportStatus.VALIDATION_FAILED:
      return `/staff/import/${importId}/errors`;
    case StaffImportStatus.AWAITING_CONFIRMATION:
    case StaffImportStatus.FAILED:
      return `/staff/import/${importId}/confirm`;
    case StaffImportStatus.COMPLETED:
      return `/staff/import/${importId}/complete`;
    case StaffImportStatus.CANCELLED:
    case StaffImportStatus.UPLOADED:
    default:
      return "/staff/import";
  }
}
