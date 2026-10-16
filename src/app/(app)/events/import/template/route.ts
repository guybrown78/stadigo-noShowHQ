import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import {
  XLSX_CONTENT_TYPE,
  type EventImportTemplateVariant,
} from "@/lib/events/import/constants";
import { buildEventImportTemplate } from "@/lib/events/import/template";
import { listEventTypesForTenant } from "@/lib/events/queries";
import { ensureTenantEventCatalog } from "@/lib/events/provision";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const user = await requireTenant();
  await ensureTenantEventCatalog(prisma, user.tenantId);
  const [types, venues] = await Promise.all([
    listEventTypesForTenant(prisma, user.tenantId),
    prisma.venue.findMany({
      where: { tenantId: user.tenantId, active: true },
      select: { identifier: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const variant = templateVariant(request);
  const buffer = await buildEventImportTemplate(
    types.map((type) => ({
      name: type.name,
      subtypes: type.subtypes.map((subtype) => ({ name: subtype.name })),
    })),
    variant,
    venues,
  );
  const filename =
    variant === "minimum"
      ? "noshowhq-events-import-minimum.xlsx"
      : "noshowhq-events-import.xlsx";

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function templateVariant(request: Request): EventImportTemplateVariant {
  const variant = new URL(request.url).searchParams.get("variant");
  return variant === "minimum" ? "minimum" : "full";
}
