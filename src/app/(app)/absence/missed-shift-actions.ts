"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { AbsenceAccessError } from "@/lib/absence/errors";
import { safeFollowUpReturnTo } from "@/lib/absence/follow-up-url";
import {
  addMissedShift,
  removeMissedShift,
} from "@/lib/absence/missed-shift-service";
import {
  parseAddMissedShiftFormData,
  parseRemoveMissedShiftFormData,
} from "@/lib/absence/missed-shift-schema";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { flattenFieldErrors, FORM_CHECK_MESSAGE } from "@/lib/form";

export type MissedShiftActionState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  existingAbsenceId?: string;
};

function revalidateMissedShifts(absenceId: string, staffId: string) {
  revalidatePath(`/absence/${absenceId}`);
  revalidatePath(`/staff/${staffId}`);
  revalidatePath("/ledger");
}

function redirectAfterShift(absenceId: string, formData: FormData): never {
  const returnTo = safeFollowUpReturnTo(formData.get("returnTo"));
  if (returnTo) {
    redirect(returnTo);
  }
  redirect(`/absence/${absenceId}?shifts=1`);
}

export async function addMissedShiftAction(
  _prev: MissedShiftActionState,
  formData: FormData,
): Promise<MissedShiftActionState> {
  const user = await requireTenant();
  const parsed = parseAddMissedShiftFormData(formData);
  if (!parsed.success) {
    return {
      error: FORM_CHECK_MESSAGE,
      fieldErrors: flattenFieldErrors(parsed.error),
    };
  }
  try {
    const result = await addMissedShift(prisma, {
      tenantId: user.tenantId,
      userId: user.id,
      input: parsed.data,
    });
    if (!result.ok) {
      return {
        error: result.error,
        fieldErrors: result.fieldErrors,
        existingAbsenceId: result.existingAbsenceId,
      };
    }
    revalidateMissedShifts(result.absenceId, result.staffId);
    redirectAfterShift(result.absenceId, formData);
  } catch (error) {
    if (error instanceof AbsenceAccessError) {
      notFound();
    }
    throw error;
  }
}

export async function removeMissedShiftAction(
  _prev: MissedShiftActionState,
  formData: FormData,
): Promise<MissedShiftActionState> {
  const user = await requireTenant();
  const parsed = parseRemoveMissedShiftFormData(formData);
  if (!parsed.success) {
    return {
      error: FORM_CHECK_MESSAGE,
      fieldErrors: flattenFieldErrors(parsed.error),
    };
  }
  try {
    const result = await removeMissedShift(prisma, {
      tenantId: user.tenantId,
      userId: user.id,
      input: parsed.data,
    });
    if (!result.ok) {
      return {
        error: result.error,
        fieldErrors: result.fieldErrors,
        existingAbsenceId: result.existingAbsenceId,
      };
    }
    revalidateMissedShifts(result.absenceId, result.staffId);
    redirectAfterShift(result.absenceId, formData);
  } catch (error) {
    if (error instanceof AbsenceAccessError) {
      notFound();
    }
    throw error;
  }
}
