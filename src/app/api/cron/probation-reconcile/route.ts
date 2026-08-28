import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { reconcileLegacyProbations } from "@/lib/staff/reconcile-legacy";
import { reconcileTenantProbationWork } from "@/lib/staff/tasks";

export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return false;
  }
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenants = await prisma.tenant.findMany({
    select: { id: true },
    orderBy: { id: "asc" },
  });

  let created = 0;
  let skippedInsufficient = 0;
  let tasks = 0;
  for (const tenant of tenants) {
    const legacy = await reconcileLegacyProbations(prisma, tenant.id);
    created += legacy.created;
    skippedInsufficient += legacy.skippedInsufficient;
    tasks += await reconcileTenantProbationWork(prisma, tenant.id);
  }

  return NextResponse.json({
    tenants: tenants.length,
    legacyCreated: created,
    skippedInsufficient,
    tasksCreated: tasks,
  });
}

export async function GET(request: Request) {
  return POST(request);
}
