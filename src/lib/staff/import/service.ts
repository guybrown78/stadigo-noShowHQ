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
  IMPORT_CREATE_BATCH_SIZE,
  IMPORT_LINK_BATCH_SIZE,
  IMPORT_STEP_TIMEOUT_MS,
} from "@/lib/staff/import/constants";
import { sanitiseImportFileName, validateImportFileBytes } from "@/lib/staff/import/file";
import { parseImportFile } from "@/lib/staff/import/parse";
import {
  getImportForTenant,
  importStatusPath,
  parseManagerOutcome,
  parseRowNormalized,
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

export type ImportStepPhase = "create" | "link";

export type ImportStepResult =
  | {
      ok: true;
      done: false;
      phase: ImportStepPhase;
      completed: number;
      total: number;
    }
  | { ok: true; done: true; href: string }
  | {
      ok: false;
      error: string;
      phase: ImportStepPhase;
      completed: number;
      total: number;
    };

export type ImportCreateProgress = {
  started: boolean;
  phase: ImportStepPhase;
  completed: number;
  total: number;
};

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
  for (;;) {
    const step = await advanceStaffImport(db, params);
    if (!step.ok) {
      return { ok: false, error: step.error };
    }
    if (step.done) {
      return { ok: true, importId: params.importId, href: step.href };
    }
  }
}

export async function getImportCreateProgress(
  db: DbClient,
  tenantId: string,
  importId: string,
): Promise<ImportCreateProgress> {
  const record = await getImportForTenant(db, tenantId, importId);
  const created = await countCreatedRows(db, tenantId, record.id);
  if (created < record.validRows) {
    return {
      started: created > 0,
      phase: "create",
      completed: created,
      total: record.validRows,
    };
  }

  const links = managerLinkProgress(
    await loadCreatedRowsForLinking(db, tenantId, record.id),
  );
  if (links.total === 0 || links.completed >= links.total) {
    return {
      started: created > 0,
      phase: "create",
      completed: created,
      total: record.validRows,
    };
  }
  return {
    started: true,
    phase: "link",
    completed: links.completed,
    total: links.total,
  };
}

export async function advanceStaffImport(
  db: DbClient,
  params: { tenantId: string; userId: string; importId: string },
  options?: { createBatchSize?: number; linkBatchSize?: number },
): Promise<ImportStepResult> {
  const record = await getImportForTenant(db, params.tenantId, params.importId);
  const createBatchSize = options?.createBatchSize ?? IMPORT_CREATE_BATCH_SIZE;
  const linkBatchSize = options?.linkBatchSize ?? IMPORT_LINK_BATCH_SIZE;

  if (record.status === StaffImportStatus.COMPLETED) {
    return {
      ok: true,
      done: true,
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
      phase: "create",
      completed: 0,
      total: record.validRows,
    };
  }

  const created = await countCreatedRows(db, params.tenantId, record.id);
  if (created < record.validRows) {
    if (created === 0) {
      const previewError = await ensurePreviewStillValid(
        db,
        params.tenantId,
        record.id,
      );
      if (previewError) {
        return {
          ok: false,
          error: previewError,
          phase: "create",
          completed: 0,
          total: record.validRows,
        };
      }
    }

    try {
      await db.$transaction(
        async (tx) => {
          const state = await assertImportOpen(tx, params.tenantId, record.id);
          if (state === "completed") {
            return;
          }
          const batch = await tx.staffImportRow.findMany({
            where: {
              importId: record.id,
              tenantId: params.tenantId,
              status: StaffImportRowStatus.VALID,
              createdStaffId: null,
            },
            orderBy: { sourceRowNumber: "asc" },
            take: createBatchSize,
          });
          let probationAdded = 0;
          for (const row of batch) {
            const normalized = parseRowNormalized(row.normalized);
            if (!normalized) {
              throw new Error("Import row is missing mapping data");
            }
            const saved = await createStaff(tx, {
              tenantId: params.tenantId,
              userId: params.userId,
              input: staffInputFromNormalized(normalized),
            });
            if (!saved.ok) {
              throw new Error(mutationMessage(saved));
            }
            await tx.staffImportRow.update({
              where: { id: row.id },
              data: { createdStaffId: saved.id },
            });
            if (normalized.applyProbation) {
              probationAdded += 1;
            }
          }
          if (batch.length === 0) {
            return;
          }
          await tx.staffImport.update({
            where: { id: record.id },
            data: {
              status: StaffImportStatus.AWAITING_CONFIRMATION,
              ...(created === 0 ? { confirmedAt: new Date() } : {}),
              failedAt: null,
              failureReason: null,
              createdStaffCount: { increment: batch.length },
              createdProbationCount: { increment: probationAdded },
            },
          });
        },
        { timeout: IMPORT_STEP_TIMEOUT_MS },
      );
    } catch (error) {
      return stepFailure(error, "create", created, record.validRows);
    }

    const completed = await countCreatedRows(db, params.tenantId, record.id);
    if (completed === created) {
      return {
        ok: false,
        error:
          "Staff could not be created. You can continue from the people already saved.",
        phase: "create",
        completed,
        total: record.validRows,
      };
    }
    return {
      ok: true,
      done: false,
      phase: "create",
      completed,
      total: record.validRows,
    };
  }

  const beforeLinks = managerLinkProgress(
    await loadCreatedRowsForLinking(db, params.tenantId, record.id),
  );

  try {
    const finished = await db.$transaction(
      async (tx) => {
        const state = await assertImportOpen(tx, params.tenantId, record.id);
        if (state === "completed") {
          return true;
        }
        const rows = await loadCreatedRowsForLinking(
          tx,
          params.tenantId,
          record.id,
        );
        const createdByStaffKey = new Map<string, string>();
        for (const row of rows) {
          const normalized = parseRowNormalized(row.normalized);
          if (normalized && row.createdStaffId) {
            createdByStaffKey.set(normalized.staffIdNormalized, row.createdStaffId);
          }
        }
        const pending = rows.filter((row) => {
          const outcome = parseManagerOutcome(row.managerOutcome);
          return (
            outcome &&
            outcome.kind !== "none" &&
            !row.createdStaff?.managerStaffId
          );
        });
        if (pending.length === 0) {
          const now = new Date();
          await tx.staffImport.update({
            where: { id: record.id },
            data: {
              status: StaffImportStatus.COMPLETED,
              confirmedAt: record.confirmedAt ?? now,
              completedAt: now,
              failedAt: null,
              failureReason: null,
              createdStaffCount: created,
            },
          });
          return true;
        }

        for (const row of pending.slice(0, linkBatchSize)) {
          const outcome = parseManagerOutcome(row.managerOutcome);
          const createdId = row.createdStaffId;
          if (!outcome || outcome.kind === "none" || !createdId) {
            continue;
          }
          const managerStaffId = managerIdForOutcome(outcome, createdByStaffKey);
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
            throw new Error(mutationMessage(linked));
          }
        }
        return false;
      },
      { timeout: IMPORT_STEP_TIMEOUT_MS },
    );

    if (finished) {
      return {
        ok: true,
        done: true,
        href: `/staff/import/${record.id}/complete`,
      };
    }
  } catch (error) {
    const links = managerLinkProgress(
      await loadCreatedRowsForLinking(db, params.tenantId, record.id),
    );
    return stepFailure(error, "link", links.completed, links.total);
  }

  const links = managerLinkProgress(
    await loadCreatedRowsForLinking(db, params.tenantId, record.id),
  );
  if (links.completed === beforeLinks.completed) {
    return {
      ok: false,
      error:
        "Managers could not be added. You can continue from the people already saved.",
      phase: "link",
      completed: links.completed,
      total: links.total,
    };
  }
  return {
    ok: true,
    done: false,
    phase: "link",
    completed: links.completed,
    total: links.total,
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

async function countCreatedRows(
  db: PrismaClient | Prisma.TransactionClient,
  tenantId: string,
  importId: string,
) {
  return db.staffImportRow.count({
    where: {
      importId,
      tenantId,
      status: StaffImportRowStatus.VALID,
      createdStaffId: { not: null },
    },
  });
}

async function loadCreatedRowsForLinking(
  db: PrismaClient | Prisma.TransactionClient,
  tenantId: string,
  importId: string,
) {
  return db.staffImportRow.findMany({
    where: {
      importId,
      tenantId,
      status: StaffImportRowStatus.VALID,
      createdStaffId: { not: null },
    },
    select: {
      createdStaffId: true,
      normalized: true,
      managerOutcome: true,
      createdStaff: { select: { managerStaffId: true } },
    },
  });
}

function managerLinkProgress(
  rows: Array<{
    managerOutcome: Prisma.JsonValue | null;
    createdStaff: { managerStaffId: string | null } | null;
  }>,
) {
  let total = 0;
  let completed = 0;
  for (const row of rows) {
    const outcome = parseManagerOutcome(row.managerOutcome);
    if (!outcome || outcome.kind === "none") {
      continue;
    }
    total += 1;
    if (row.createdStaff?.managerStaffId) {
      completed += 1;
    }
  }
  return { total, completed };
}

function managerIdForOutcome(
  outcome: ManagerOutcome,
  createdByStaffKey: Map<string, string>,
) {
  if (outcome.kind === "existing") {
    return outcome.managerStaffId;
  }
  if (outcome.kind === "import") {
    return createdByStaffKey.get(normalizeStaffIdKey(outcome.staffIdNumber)) ?? null;
  }
  return null;
}

function mutationMessage(result: {
  error: string;
  fieldErrors?: Record<string, string[] | undefined>;
}) {
  const fieldMessage = result.fieldErrors
    ? Object.values(result.fieldErrors).flat().find(Boolean)
    : undefined;
  return fieldMessage ?? result.error;
}

function stepFailure(
  error: unknown,
  phase: ImportStepPhase,
  completed: number,
  total: number,
): ImportStepResult {
  if (error instanceof StaffAccessError) {
    throw error;
  }
  return {
    ok: false,
    error:
      error instanceof Error
        ? error.message
        : "Staff could not be created. You can continue from the people already saved.",
    phase,
    completed,
    total,
  };
}

async function ensurePreviewStillValid(
  db: DbClient,
  tenantId: string,
  importId: string,
) {
  const rows = await db.staffImportRow.findMany({
    where: {
      importId,
      tenantId,
      status: StaffImportRowStatus.VALID,
    },
    orderBy: { sourceRowNumber: "asc" },
    select: { sourceRowNumber: true, raw: true },
  });
  const [existingStaff, tenant] = await Promise.all([
    loadExistingStaff(db, tenantId),
    db.tenant.findUnique({
      where: { id: tenantId },
      select: { defaultProbationDays: true },
    }),
  ]);
  const tenantDefaultDays =
    tenant?.defaultProbationDays && tenant.defaultProbationDays > 0
      ? tenant.defaultProbationDays
      : DEFAULT_PROBATION_DAYS;
  const revalidated = validateImportRows(
    rows.map((row) => ({
      sourceRowNumber: row.sourceRowNumber,
      raw: parseRowRaw(row.raw),
      empty: false,
    })),
    { existingStaff, tenantDefaultDays },
  );
  if (revalidated.hasBlockingErrors || revalidated.validRows !== rows.length) {
    return "Staff data changed after the preview. Upload a corrected file and check it again.";
  }
  return null;
}

async function assertImportOpen(
  db: Prisma.TransactionClient,
  tenantId: string,
  importId: string,
): Promise<"open" | "completed"> {
  const locked = await lockImport(db, tenantId, importId);
  if (locked.status === StaffImportStatus.COMPLETED) {
    return "completed";
  }
  if (
    locked.status !== StaffImportStatus.AWAITING_CONFIRMATION &&
    locked.status !== StaffImportStatus.FAILED
  ) {
    throw new Error("This import is not ready to create staff.");
  }
  return "open";
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
