"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { AbsenceAccessError } from "@/lib/absence/errors";
import {
  cancelFollowUp,
  completeFollowUp,
  createFollowUp,
  updateFollowUp,
} from "@/lib/absence/follow-up-service";
import {
  parseCancelFollowUpFormData,
  parseCompleteFollowUpFormData,
  parseCreateFollowUpFormData,
  parseUpdateFollowUpFormData,
} from "@/lib/absence/follow-up-schema";
import { safeFollowUpReturnTo } from "@/lib/absence/follow-up-url";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { flattenFieldErrors, FORM_CHECK_MESSAGE } from "@/lib/form";

export type FollowUpActionState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

function revalidateFollowUp(absenceId: string, staffId: string) {
  revalidatePath(`/absence/${absenceId}`);
  revalidatePath(`/staff/${staffId}`);
  revalidatePath("/ledger");
  revalidatePath("/follow-ups");
  revalidatePath("/dashboard");
}

function redirectAfterFollowUp(absenceId: string, formData: FormData): never {
  const returnTo = safeFollowUpReturnTo(formData.get("returnTo"));
  if (returnTo) {
    redirect(returnTo);
  }
  redirect(`/absence/${absenceId}?followUp=1`);
}

export async function createFollowUpAction(
  _prev: FollowUpActionState,
  formData: FormData,
): Promise<FollowUpActionState> {
  const user = await requireTenant();
  const parsed = parseCreateFollowUpFormData(formData);
  if (!parsed.success) {
    return {
      error: FORM_CHECK_MESSAGE,
      fieldErrors: flattenFieldErrors(parsed.error),
    };
  }
  try {
    const result = await createFollowUp(prisma, {
      tenantId: user.tenantId,
      userId: user.id,
      input: parsed.data,
    });
    if (!result.ok) {
      return { error: result.error, fieldErrors: result.fieldErrors };
    }
    revalidateFollowUp(result.absenceId, result.staffId);
    redirectAfterFollowUp(result.absenceId, formData);
  } catch (error) {
    if (error instanceof AbsenceAccessError) {
      notFound();
    }
    throw error;
  }
}

export async function updateFollowUpAction(
  _prev: FollowUpActionState,
  formData: FormData,
): Promise<FollowUpActionState> {
  const user = await requireTenant();
  const parsed = parseUpdateFollowUpFormData(formData);
  if (!parsed.success) {
    return {
      error: FORM_CHECK_MESSAGE,
      fieldErrors: flattenFieldErrors(parsed.error),
    };
  }
  try {
    const result = await updateFollowUp(prisma, {
      tenantId: user.tenantId,
      userId: user.id,
      input: parsed.data,
    });
    if (!result.ok) {
      return { error: result.error, fieldErrors: result.fieldErrors };
    }
    revalidateFollowUp(result.absenceId, result.staffId);
    redirectAfterFollowUp(result.absenceId, formData);
  } catch (error) {
    if (error instanceof AbsenceAccessError) {
      notFound();
    }
    throw error;
  }
}

export async function completeFollowUpAction(
  _prev: FollowUpActionState,
  formData: FormData,
): Promise<FollowUpActionState> {
  const user = await requireTenant();
  const parsed = parseCompleteFollowUpFormData(formData);
  if (!parsed.success) {
    return {
      error: FORM_CHECK_MESSAGE,
      fieldErrors: flattenFieldErrors(parsed.error),
    };
  }
  try {
    const result = await completeFollowUp(prisma, {
      tenantId: user.tenantId,
      userId: user.id,
      input: parsed.data,
    });
    if (!result.ok) {
      return { error: result.error, fieldErrors: result.fieldErrors };
    }
    revalidateFollowUp(result.absenceId, result.staffId);
    redirectAfterFollowUp(result.absenceId, formData);
  } catch (error) {
    if (error instanceof AbsenceAccessError) {
      notFound();
    }
    throw error;
  }
}

export async function cancelFollowUpAction(
  _prev: FollowUpActionState,
  formData: FormData,
): Promise<FollowUpActionState> {
  const user = await requireTenant();
  const parsed = parseCancelFollowUpFormData(formData);
  if (!parsed.success) {
    return {
      error: FORM_CHECK_MESSAGE,
      fieldErrors: flattenFieldErrors(parsed.error),
    };
  }
  try {
    const result = await cancelFollowUp(prisma, {
      tenantId: user.tenantId,
      userId: user.id,
      input: parsed.data,
    });
    if (!result.ok) {
      return { error: result.error, fieldErrors: result.fieldErrors };
    }
    revalidateFollowUp(result.absenceId, result.staffId);
    redirectAfterFollowUp(result.absenceId, formData);
  } catch (error) {
    if (error instanceof AbsenceAccessError) {
      notFound();
    }
    throw error;
  }
}
