import { createHash } from "node:crypto";
import {
  Prisma,
  StaffImportRowStatus,
  StaffImportStatus,
  type PrismaClient,
} from "@prisma/client";
import { DEFAULT_PROBATION_DAYS } from "@/lib/staff/catalog";
import { StaffAccessError } from "@/lib/staff/errors";
import {
  IMPORT_STAFF_BATCH_SIZE,
  IMPORT_TRANSACTION_TIMEOUT_MS,
} from "@/lib/staff/import/constants";
import { sanitiseImportFileName, validateImportFileBytes } from "@/lib/staff/import/file";
import { parseImportFile } from "@/lib/staff/import/parse";
import {
  getImportForTenant,
  importStatusPath,
  parseRowRaw,
} from "@/lib/staff/import/queries";
import type {
  ExistingStaffForImport,
  ManagerOutcome,
} from "@/lib/staff/import/types";
import {
  staffInputFromNormalized,
  validateImportRows,
} from "@/lib/staff/import/validate";
import { normalizeStaffIdKey } from "@/lib/staff/normalize";
import { createStaff, linkStaffManager } from "@/lib/staff/service";

type DbClient = PrismaClient;

export type ImportMutationResult =
  | { ok: true; importId: string; href: string; repeatWarning?: boolean }
  | { ok: false; error: string };

export async function createImportFromUpload(
  db: DbClient,
  params: {
    tenantId: string;
    userId: string;
    fileName: string;
    bytes: Uint8Array;
  },
): Promise<ImportMutationResult> {
  const fileError = validateImportFileBytes(params.fileName, params.bytes);
  if (fileError) {
    return { ok: false, error: fileError };
  }

  const parsed = await parseImportFile(params.fileName, params.bytes);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }

  const fileHash = createHash("sha256").update(params.bytes).digest("hex");
  const originalFileName = sanitiseImportFileName(params.fileName);

  const [existingStaff, tenant, repeat] = await Promise.all([
    loadExistingStaff(db, params.tenantId),
    db.tenant.findUnique({
      where: { id: params.tenantId },
      select: { defaultProbationDays: true },
    }),
    db.staffImport.findFirst({
      where: {
        tenantId: params.tenantId,
        fileHash,
        status: StaffImportStatus.COMPLETED,
      },
      select: { id: true },
    }),
  ]);

  const tenantDefaultDays =
    tenant?.defaultProbationDays && tenant.defaultProbationDays > 0
      ? tenant.defaultProbationDays
      : DEFAULT_PROBATION_DAYS;

  const result = validateImportRows(parsed.rows, {
    existingStaff,
    tenantDefaultDays,
  });

  if (result.validRows === 0 && result.invalidRows === 0) {
    return {
      ok: false,
      error:
        "The file has no staff rows. Add people to the Staff sheet and upload again.",
    };
  }

  const status = result.hasBlockingErrors
    ? StaffImportStatus.VALIDATION_FAILED
    : StaffImportStatus.AWAITING_CONFIRMATION;

  const created = await db.staffImport.create({
    data: {
      tenantId: params.tenantId,
      uploadedById: params.userId,
      originalFileName,
      fileHash,
      totalRows: result.totalRows,
      validRows: result.validRows,
      invalidRows: result.invalidRows,
      ignoredRows: result.ignoredRows,
      existingManagerMatchCount: result.existingManagerMatchCount,
      importedManagerMatchCount: result.importedManagerMatchCount,
      status,
      rows: {
        create: result.rows.map((row) => ({
          tenantId: params.tenantId,
          sourceRowNumber: row.sourceRowNumber,
          raw: row.raw as unknown as Prisma.InputJsonValue,
          normalized: (row.normalized ??
            Prisma.JsonNull) as Prisma.InputJsonValue,
          fieldErrors:
            Object.keys(row.fieldErrors).length > 0
              ? (row.fieldErrors as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          managerOutcome: (row.managerOutcome ??
            Prisma.JsonNull) as Prisma.InputJsonValue,
          probationPreview: (row.probationPreview ??
            Prisma.JsonNull) as Prisma.InputJsonValue,
          status: row.status as StaffImportRowStatus,
        })),
      },
    },
    select: { id: true, status: true },
  });

  return {
    ok: true,
    importId: created.id,
    href: importStatusPath(created.status, created.id),
    repeatWarning: Boolean(repeat),
  };
}

export async function confirmStaffImport(
  db: DbClient,
  params: { tenantId: string; userId: string; importId: string },
): Promise<ImportMutationResult> {
  const record = await getImportForTenant(db, params.tenantId, params.importId);

  if (record.status === StaffImportStatus.COMPLETED) {
    return {
      ok: true,
      importId: record.id,
      href: `/staff/import/${record.id}/complete`,
    };
  }
  if (
    record.status !== StaffImportStatus.AWAITING_CONFIRMATION &&
    record.status !== StaffImportStatus.FAILED
  ) {
    return {
      ok: false,
      error: "This import is not ready to create staff.",
    };
  }
  if (
    record.status === StaffImportStatus.FAILED &&
    record.createdStaffCount > 0
  ) {
    return {
      ok: false,
      error:
        "This import already failed after creating data and cannot be retried safely.",
    };
  }

  try {
    await db.$transaction(
      async (tx) => {
        const locked = await lockImport(tx, params.tenantId, params.importId);
        if (locked.status === StaffImportStatus.COMPLETED) {
          return;
        }
        if (
          locked.status !== StaffImportStatus.AWAITING_CONFIRMATION &&
          locked.status !== StaffImportStatus.FAILED
        ) {
          throw new Error("Import is not ready to create staff");
        }

        const rows = await tx.staffImportRow.findMany({
          where: {
            importId: record.id,
            tenantId: params.tenantId,
            status: StaffImportRowStatus.VALID,
          },
          orderBy: { sourceRowNumber: "asc" },
        });

        const existingStaff = await loadExistingStaff(tx, params.tenantId);
        const tenant = await tx.tenant.findUnique({
          where: { id: params.tenantId },
          select: { defaultProbationDays: true },
        });
        const tenantDefaultDays =
          tenant?.defaultProbationDays && tenant.defaultProbationDays > 0
            ? tenant.defaultProbationDays
            : DEFAULT_PROBATION_DAYS;

        const parsedRows = rows.map((row) => ({
          sourceRowNumber: row.sourceRowNumber,
          raw: parseRowRaw(row.raw),
          empty: false,
        }));
        const revalidated = validateImportRows(parsedRows, {
          existingStaff,
          tenantDefaultDays,
        });
        if (revalidated.hasBlockingErrors || revalidated.validRows !== rows.length) {
          throw new Error(
            "Staff data changed after the preview. Upload a corrected file and check it again.",
          );
        }

        const revalidatedByRow = new Map(
          revalidated.rows
            .filter((row) => row.status === "VALID")
            .map((row) => [row.sourceRowNumber, row]),
        );

        const createdByRowId = new Map<string, string>();
        const createdByStaffKey = new Map<string, string>();
        let createdProbationCount = 0;

        for (let index = 0; index < rows.length; index += IMPORT_STAFF_BATCH_SIZE) {
          const chunk = rows.slice(index, index + IMPORT_STAFF_BATCH_SIZE);
          for (const row of chunk) {
            const fresh = revalidatedByRow.get(row.sourceRowNumber);
            const normalized = fresh?.normalized ?? null;
            if (!normalized) {
              throw new Error("Import row is missing mapping data");
            }
            const created = await createStaff(tx, {
              tenantId: params.tenantId,
              userId: params.userId,
              input: staffInputFromNormalized(normalized),
            });
            if (!created.ok) {
              throw new Error(
                created.fieldErrors
                  ? Object.values(created.fieldErrors).flat()[0] ?? created.error
                  : created.error,
              );
            }
            createdByRowId.set(row.id, created.id);
            createdByStaffKey.set(normalized.staffIdNormalized, created.id);
            if (normalized.applyProbation) {
              createdProbationCount += 1;
            }
          }
        }

        for (const row of rows) {
          const fresh = revalidatedByRow.get(row.sourceRowNumber);
          const outcome = (fresh?.managerOutcome ??
            row.managerOutcome) as ManagerOutcome | null;
          const createdId = createdByRowId.get(row.id);
          if (!createdId || !outcome || outcome.kind === "none") {
            continue;
          }
          let managerStaffId: string | null = null;
          if (outcome.kind === "existing") {
            managerStaffId = outcome.managerStaffId;
          } else if (outcome.kind === "import") {
            const managerKey = fresh?.normalized?.managerStaffIdNumber
              ? normalizeStaffIdKey(fresh.normalized.managerStaffIdNumber)
              : null;
            managerStaffId = managerKey
              ? createdByStaffKey.get(managerKey) ?? null
              : null;
          }
          if (!managerStaffId) {
            throw new Error("A manager mapping is missing after create");
          }
          const linked = await linkStaffManager(tx, {
            tenantId: params.tenantId,
            userId: params.userId,
            staffId: createdId,
            managerStaffId,
          });
          if (!linked.ok) {
            throw new Error(
              linked.fieldErrors
                ? Object.values(linked.fieldErrors).flat()[0] ?? linked.error
                : linked.error,
            );
          }
        }

        const now = new Date();
        for (const row of rows) {
          const createdId = createdByRowId.get(row.id);
          if (!createdId) {
            throw new Error("A staff row was not created");
          }
          await tx.staffImportRow.update({
            where: { id: row.id },
            data: { createdStaffId: createdId },
          });
        }

        await tx.staffImport.update({
          where: { id: record.id },
          data: {
            status: StaffImportStatus.COMPLETED,
            confirmedAt: now,
            completedAt: now,
            failedAt: null,
            failureReason: null,
            createdStaffCount: createdByRowId.size,
            createdProbationCount,
          },
        });
      },
      { timeout: IMPORT_TRANSACTION_TIMEOUT_MS },
    );
  } catch (error) {
    if (error instanceof StaffAccessError) {
      throw error;
    }
    await db.staffImport.updateMany({
      where: {
        id: record.id,
        tenantId: params.tenantId,
        status: { not: StaffImportStatus.COMPLETED },
      },
      data: {
        status: StaffImportStatus.FAILED,
        failedAt: new Date(),
        failureReason:
          error instanceof Error
            ? error.message
            : "Could not create staff. No staff were kept from this import.",
      },
    });
    return {
      ok: false,
      error:
        "Staff could not be created. No imported staff were kept. You can try creating them again, or upload a corrected file.",
    };
  }

  return {
    ok: true,
    importId: record.id,
    href: `/staff/import/${record.id}/complete`,
  };
}

export async function cancelImport(
  db: DbClient,
  params: { tenantId: string; importId: string },
): Promise<ImportMutationResult> {
  const record = await getImportForTenant(db, params.tenantId, params.importId);
  if (record.status === StaffImportStatus.COMPLETED) {
    return {
      ok: false,
      error: "This import has already created staff and cannot be cancelled.",
    };
  }

  await db.$transaction(async (tx) => {
    await tx.staffImportRow.deleteMany({
      where: { importId: record.id, tenantId: params.tenantId },
    });
    await tx.staffImport.update({
      where: { id: record.id },
      data: {
        status: StaffImportStatus.CANCELLED,
        cancelledAt: new Date(),
      },
    });
  });

  return { ok: true, importId: record.id, href: "/staff/import" };
}

async function loadExistingStaff(
  db: PrismaClient | Prisma.TransactionClient,
  tenantId: string,
): Promise<ExistingStaffForImport[]> {
  return db.staff.findMany({
    where: { tenantId, deletedAt: null },
    select: {
      id: true,
      staffIdNumber: true,
      staffIdNormalized: true,
      firstName: true,
      lastName: true,
      employmentStatus: true,
    },
  });
}

async function lockImport(
  db: Prisma.TransactionClient,
  tenantId: string,
  importId: string,
) {
  const rows = await db.$queryRaw<
    { id: string; status: StaffImportStatus }[]
  >`
    SELECT id, status
    FROM "StaffImport"
    WHERE id = ${importId} AND "tenantId" = ${tenantId}
    FOR UPDATE
  `;
  const row = rows[0];
  if (!row) {
    throw new StaffAccessError();
  }
  return row;
}
