"use server";

import { AbsenceAccessError } from "@/lib/absence/errors";
import {
  getAbsenceForTenant,
  getTenantTimezone,
  type AbsenceDetail,
} from "@/lib/absence/queries";
import { todayIsoInTimeZone } from "@/lib/absence/timezone";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";

export type LedgerAbsenceDetailResult =
  | {
      ok: true;
      absence: AbsenceDetail;
      timeZone?: string;
      todayIso?: string;
    }
  | { ok: false };

export async function loadLedgerAbsenceDetail(
  absenceId: string,
): Promise<LedgerAbsenceDetailResult> {
  const user = await requireTenant();
  try {
    const absence = await getAbsenceForTenant(
      prisma,
      user.tenantId,
      absenceId,
    );
    let timeZone: string | undefined;
    let todayIso: string | undefined;
    try {
      timeZone = await getTenantTimezone(prisma, user.tenantId);
      todayIso = todayIsoInTimeZone(timeZone);
    } catch {
      timeZone = undefined;
      todayIso = undefined;
    }
    return { ok: true, absence, timeZone, todayIso };
  } catch (error) {
    if (error instanceof AbsenceAccessError) {
      return { ok: false };
    }
    throw error;
  }
}
