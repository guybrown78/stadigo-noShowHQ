import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { StaffAccessError } from "@/lib/staff/errors";
import { XLSX_CONTENT_TYPE } from "@/lib/staff/import/constants";
import {
  getImportSummaryForTenant,
  listAllImportRowsForReport,
  parseFieldErrors,
  parseRowRaw,
} from "@/lib/staff/import/queries";
import { buildImportErrorReport } from "@/lib/staff/import/report";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireTenant();
  const { id } = await context.params;

  try {
    await getImportSummaryForTenant(prisma, user.tenantId, id);
    const rows = await listAllImportRowsForReport(prisma, user.tenantId, id);
    const buffer = await buildImportErrorReport(
      rows.map((row) => ({
        sourceRowNumber: row.sourceRowNumber,
        raw: parseRowRaw(row.raw),
        status: row.status,
        fieldErrors: parseFieldErrors(row.fieldErrors),
      })),
    );

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": XLSX_CONTENT_TYPE,
        "Content-Disposition": `attachment; filename="noshowhq-staff-import-errors.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof StaffAccessError) {
      notFound();
    }
    throw error;
  }
}
