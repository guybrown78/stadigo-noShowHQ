import { prisma } from "@/lib/db";
import { reconcileLegacyProbations } from "@/lib/staff/reconcile-legacy";
import { reconcileTenantProbationWork } from "@/lib/staff/tasks";

async function main() {
  const tenants = await prisma.tenant.findMany({
    select: { id: true, slug: true },
    orderBy: { slug: "asc" },
  });

  let created = 0;
  let skippedInsufficient = 0;
  let tasks = 0;
  for (const tenant of tenants) {
    const legacy = await reconcileLegacyProbations(prisma, tenant.id);
    created += legacy.created;
    skippedInsufficient += legacy.skippedInsufficient;
    tasks += await reconcileTenantProbationWork(prisma, tenant.id);
    console.info(
      `Reconciled ${tenant.slug}: ${legacy.created} legacy, ${legacy.skippedInsufficient} insufficient, tasks +${tasks}`,
    );
  }

  console.info(
    `Done. tenants=${tenants.length} legacyCreated=${created} skippedInsufficient=${skippedInsufficient} tasksCreated=${tasks}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
