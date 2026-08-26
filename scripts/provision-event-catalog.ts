import { prisma } from "../src/lib/db";
import { ensureTenantEventCatalog } from "../src/lib/events/provision";

async function main() {
  const tenants = await prisma.tenant.findMany({
    select: { id: true, name: true, slug: true },
  });

  for (const tenant of tenants) {
    await ensureTenantEventCatalog(prisma, tenant.id);
    console.log(`Provisioned event catalog for ${tenant.slug}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
