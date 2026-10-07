import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { evaluateTenantSicknessEvidence } from "@/lib/absence/evidence-evaluation";

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

  let episodesScanned = 0;
  let tasksCreated = 0;
  let tasksCompleted = 0;
  let tasksCancelled = 0;
  let failedTenants = 0;
  for (const tenant of tenants) {
    const result = await evaluateTenantSicknessEvidence(prisma, tenant.id);
    episodesScanned += result.episodesScanned;
    tasksCreated += result.tasksCreated;
    tasksCompleted += result.tasksCompleted;
    tasksCancelled += result.tasksCancelled;
    if (result.failed) {
      failedTenants += 1;
    }
  }

  return NextResponse.json({
    tenants: tenants.length,
    episodesScanned,
    tasksCreated,
    tasksCompleted,
    tasksCancelled,
    failedTenants,
  });
}

export async function GET(request: Request) {
  return POST(request);
}
