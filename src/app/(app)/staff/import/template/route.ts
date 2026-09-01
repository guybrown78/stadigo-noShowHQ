import { requireTenant } from "@/lib/authz";
import { XLSX_CONTENT_TYPE } from "@/lib/staff/import/constants";
import { buildStaffImportTemplate } from "@/lib/staff/import/template";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  await requireTenant();
  const buffer = await buildStaffImportTemplate();

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition":
        'attachment; filename="noshowhq-staff-import.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
