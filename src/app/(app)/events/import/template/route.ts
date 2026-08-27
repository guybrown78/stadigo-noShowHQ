import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { XLSX_CONTENT_TYPE } from "@/lib/events/import/constants";
import { buildEventImportTemplate } from "@/lib/events/import/template";
import { listEventTypesForTenant } from "@/lib/events/queries";
import { ensureTenantEventCatalog } from "@/lib/events/provision";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const user = await requireTenant();
  await ensureTenantEventCatalog(prisma, user.tenantId);
  const types = await listEventTypesForTenant(prisma, user.tenantId);
  const buffer = await buildEventImportTemplate(
    types.map((type) => ({
      name: type.name,
      subtypes: type.subtypes.map((subtype) => ({ name: subtype.name })),
    })),
  );

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition":
        'attachment; filename="noshowhq-events-import.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
