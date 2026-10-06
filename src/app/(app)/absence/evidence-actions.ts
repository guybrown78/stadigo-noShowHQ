"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { AbsenceAccessError } from "@/lib/absence/errors";
import {
  createFitNote,
  saveSelfCertification,
  updateFitNote,
} from "@/lib/absence/evidence-service";
import {
  parseCreateFitNoteFormData,
  parseSaveSelfCertificationFormData,
  parseUpdateFitNoteFormData,
} from "@/lib/absence/evidence-schema";
import { safeFollowUpReturnTo } from "@/lib/absence/follow-up-url";
import { todayIsoInTimeZone } from "@/lib/absence/timezone";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { flattenFieldErrors, FORM_CHECK_MESSAGE } from "@/lib/form";

export type EvidenceActionState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

function revalidateEvidence(absenceId: string, staffId: string) {
  revalidatePath(`/absence/${absenceId}`);
  revalidatePath(`/staff/${staffId}`);
  revalidatePath("/ledger");
  revalidatePath("/follow-ups");
  revalidatePath("/dashboard");
}

function redirectAfterEvidence(absenceId: string, formData: FormData): never {
  const returnTo = safeFollowUpReturnTo(formData.get("returnTo"));
  if (returnTo) {
    redirect(returnTo);
  }
  redirect(`/absence/${absenceId}?evidence=1`);
}

export async function saveSelfCertificationAction(
  _prev: EvidenceActionState,
  formData: FormData,
): Promise<EvidenceActionState> {
  const user = await requireTenant();
  const parsed = parseSaveSelfCertificationFormData(formData);
  if (!parsed.success) {
    return {
      error: FORM_CHECK_MESSAGE,
      fieldErrors: flattenFieldErrors(parsed.error),
    };
  }
  try {
    const result = await saveSelfCertification(prisma, {
      tenantId: user.tenantId,
      userId: user.id,
      input: parsed.data,
    });
    if (!result.ok) {
      return { error: result.error, fieldErrors: result.fieldErrors };
    }
    revalidateEvidence(result.absenceId, result.staffId);
    redirectAfterEvidence(result.absenceId, formData);
  } catch (error) {
    if (error instanceof AbsenceAccessError) {
      notFound();
    }
    throw error;
  }
}

export async function createFitNoteAction(
  _prev: EvidenceActionState,
  formData: FormData,
): Promise<EvidenceActionState> {
  const user = await requireTenant();
  const todayIso = todayIsoInTimeZone(user.tenantTimezone);
  const parsed = parseCreateFitNoteFormData(formData, todayIso);
  if (!parsed.success) {
    return {
      error: FORM_CHECK_MESSAGE,
      fieldErrors: flattenFieldErrors(parsed.error),
    };
  }
  try {
    const result = await createFitNote(prisma, {
      tenantId: user.tenantId,
      userId: user.id,
      input: parsed.data,
    });
    if (!result.ok) {
      return { error: result.error, fieldErrors: result.fieldErrors };
    }
    revalidateEvidence(result.absenceId, result.staffId);
    redirectAfterEvidence(result.absenceId, formData);
  } catch (error) {
    if (error instanceof AbsenceAccessError) {
      notFound();
    }
    throw error;
  }
}

export async function updateFitNoteAction(
  _prev: EvidenceActionState,
  formData: FormData,
): Promise<EvidenceActionState> {
  const user = await requireTenant();
  const todayIso = todayIsoInTimeZone(user.tenantTimezone);
  const parsed = parseUpdateFitNoteFormData(formData, todayIso);
  if (!parsed.success) {
    return {
      error: FORM_CHECK_MESSAGE,
      fieldErrors: flattenFieldErrors(parsed.error),
    };
  }
  try {
    const result = await updateFitNote(prisma, {
      tenantId: user.tenantId,
      userId: user.id,
      input: parsed.data,
    });
    if (!result.ok) {
      return { error: result.error, fieldErrors: result.fieldErrors };
    }
    revalidateEvidence(result.absenceId, result.staffId);
    redirectAfterEvidence(result.absenceId, formData);
  } catch (error) {
    if (error instanceof AbsenceAccessError) {
      notFound();
    }
    throw error;
  }
}
