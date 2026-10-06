"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { AbsenceAccessError } from "@/lib/absence/errors";
import { safeFollowUpReturnTo } from "@/lib/absence/follow-up-url";
import { parseSaveReturnToWorkFormData } from "@/lib/absence/return-to-work-schema";
import { saveReturnToWork } from "@/lib/absence/return-to-work-service";
import { todayIsoInTimeZone } from "@/lib/absence/timezone";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { flattenFieldErrors, FORM_CHECK_MESSAGE } from "@/lib/form";

export type ReturnToWorkActionState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

function revalidateReturnToWork(absenceId: string, staffId: string) {
  revalidatePath(`/absence/${absenceId}`);
  revalidatePath(`/staff/${staffId}`);
  revalidatePath("/ledger");
  revalidatePath("/follow-ups");
  revalidatePath("/dashboard");
}

function redirectAfterReturnToWork(absenceId: string, formData: FormData): never {
  const returnTo = safeFollowUpReturnTo(formData.get("returnTo"));
  if (returnTo) {
    redirect(returnTo);
  }
  redirect(`/absence/${absenceId}?returnToWork=1`);
}

export async function saveReturnToWorkAction(
  _prev: ReturnToWorkActionState,
  formData: FormData,
): Promise<ReturnToWorkActionState> {
  const user = await requireTenant();
  const todayIso = todayIsoInTimeZone(user.tenantTimezone);
  const parsed = parseSaveReturnToWorkFormData(formData, todayIso);
  if (!parsed.success) {
    return {
      error: FORM_CHECK_MESSAGE,
      fieldErrors: flattenFieldErrors(parsed.error),
    };
  }
  try {
    const result = await saveReturnToWork(prisma, {
      tenantId: user.tenantId,
      userId: user.id,
      input: parsed.data,
    });
    if (!result.ok) {
      return { error: result.error, fieldErrors: result.fieldErrors };
    }
    revalidateReturnToWork(result.absenceId, result.staffId);
    redirectAfterReturnToWork(result.absenceId, formData);
  } catch (error) {
    if (error instanceof AbsenceAccessError) {
      notFound();
    }
    throw error;
  }
}
