import {
  EventImportStatus,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";
import { EventAccessError } from "@/lib/events/errors";
import { IMPORT_PREVIEW_PAGE_SIZE } from "@/lib/events/import/constants";
import type { FieldErrors, ImportRowNormalized, ImportRowRaw } from "@/lib/events/import/types";

type DbClient = PrismaClient | Prisma.TransactionClient;

export const importDetailInclude = {
  rows: {
    orderBy: { sourceRowNumber: "asc" as const },
  },
  venues: {
    orderBy: { importedName: "asc" as const },
    include: {
      matchedVenue: {
        select: {
          id: true,
          name: true,
          addressLine1: true,
          townCity: true,
          postcode: true,
          active: true,
        },
      },
      createdVenue: {
        select: {
          id: true,
          name: true,
          addressLine1: true,
          townCity: true,
          postcode: true,
        },
      },
    },
  },
} satisfies Prisma.EventImportInclude;

export type EventImportDetail = Prisma.EventImportGetPayload<{
  include: typeof importDetailInclude;
}>;

export async function getImportForTenant(
  db: DbClient,
  tenantId: string,
  importId: string,
): Promise<EventImportDetail> {
  const record = await db.eventImport.findFirst({
    where: { id: importId, tenantId },
    include: importDetailInclude,
  });
  if (!record) {
    throw new EventAccessError();
  }
  return record;
}

export async function getImportSummaryForTenant(
  db: DbClient,
  tenantId: string,
  importId: string,
) {
  const record = await db.eventImport.findFirst({
    where: { id: importId, tenantId },
    include: {
      venues: { orderBy: { importedName: "asc" } },
    },
  });
  if (!record) {
    throw new EventAccessError();
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

export function parseFieldErrors(
  value: Prisma.JsonValue | null,
): FieldErrors {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as FieldErrors;
}

export async function listInvalidImportRows(
  db: DbClient,
  tenantId: string,
  importId: string,
  query: { q: string; page: number },
) {
  const where: Prisma.EventImportRowWhereInput = {
    importId,
    tenantId,
    status: "INVALID",
  };
  const rows = await db.eventImportRow.findMany({
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
  return {
    rows: filtered.slice(start, start + IMPORT_PREVIEW_PAGE_SIZE),
    total: filtered.length,
    page,
    pageCount,
  };
}

export async function listValidImportPreview(
  db: DbClient,
  tenantId: string,
  importId: string,
  page: number,
) {
  const where: Prisma.EventImportRowWhereInput = {
    importId,
    tenantId,
    status: "VALID",
  };
  const [rows, total] = await Promise.all([
    db.eventImportRow.findMany({
      where,
      orderBy: { sourceRowNumber: "asc" },
      skip: (page - 1) * IMPORT_PREVIEW_PAGE_SIZE,
      take: IMPORT_PREVIEW_PAGE_SIZE,
    }),
    db.eventImportRow.count({ where }),
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
  return db.eventImportRow.findMany({
    where: { importId, tenantId, status: { not: "IGNORED" } },
    orderBy: { sourceRowNumber: "asc" },
  });
}

export function importStatusPath(status: EventImportStatus, importId: string): string {
  switch (status) {
    case EventImportStatus.VALIDATION_FAILED:
      return `/events/import/${importId}/errors`;
    case EventImportStatus.AWAITING_VENUE_CONFIRMATION:
      return `/events/import/${importId}/venues`;
    case EventImportStatus.VENUES_CONFIRMED:
    case EventImportStatus.AWAITING_EVENT_CONFIRMATION:
    case EventImportStatus.FAILED:
      return `/events/import/${importId}/confirm`;
    case EventImportStatus.COMPLETED:
      return `/events/import/${importId}/complete`;
    case EventImportStatus.CANCELLED:
    case EventImportStatus.UPLOADED:
    default:
      return "/events/import";
  }
}
