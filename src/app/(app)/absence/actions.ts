"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { AbsenceAccessError } from "@/lib/absence/errors";
import {
  searchEventsForAbsence,
  searchStaffForAbsence,
  type AbsenceEventOption,
  type AbsenceStaffOption,
} from "@/lib/absence/queries";
import {
  flattenFieldErrors,
  parseArchiveCancellationFormData,
  parseCancellationFormData,
  parseCorrectCancellationFormData,
} from "@/lib/absence/schema";
import {
  archiveCancellation,
  correctCancellation,
  createCancellation,
} from "@/lib/absence/service";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { FORM_CHECK_MESSAGE } from "@/lib/form";

export type AbsenceActionState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  existingAbsenceId?: string;
};

export async function searchAbsenceStaffAction(
  query: string,
): Promise<AbsenceStaffOption[]> {
  const user = await requireTenant();
  return searchStaffForAbsence(prisma, user.tenantId, query);
}

export async function searchAbsenceEventsAction(
  query: string,
): Promise<AbsenceEventOption[]> {
  const user = await requireTenant();
  return searchEventsForAbsence(prisma, user.tenantId, query);
}

export async function createCancellationAction(
  _prev: AbsenceActionState,
  formData: FormData,
): Promise<AbsenceActionState> {
  const user = await requireTenant();
  const parsed = parseCancellationFormData(formData);
  if (!parsed.success) {
    return {
      error: FORM_CHECK_MESSAGE,
      fieldErrors: flattenFieldErrors(parsed.error),
    };
  }

  const result = await createCancellation(prisma, {
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

  revalidatePath("/absence/new");
  revalidatePath(`/staff/${parsed.data.staffId}`);
  redirect(`/absence/${result.id}?created=1`);
}

export async function correctCancellationAction(
  _prev: AbsenceActionState,
  formData: FormData,
): Promise<AbsenceActionState> {
  const user = await requireTenant();
  const absenceId = String(formData.get("absenceId") ?? "");
  if (!absenceId) {
    notFound();
  }

  const parsed = parseCorrectCancellationFormData(formData);
  if (!parsed.success) {
    return {
      error: FORM_CHECK_MESSAGE,
      fieldErrors: flattenFieldErrors(parsed.error),
    };
  }

  try {
    const result = await correctCancellation(prisma, {
      tenantId: user.tenantId,
      userId: user.id,
      absenceId,
      input: parsed.data,
    });

    if (!result.ok) {
      return {
        error: result.error,
        fieldErrors: result.fieldErrors,
        existingAbsenceId: result.existingAbsenceId,
      };
    }

    revalidatePath(`/absence/${result.id}`);
    revalidatePath(`/staff/${parsed.data.staffId}`);
    redirect(`/absence/${result.id}?updated=1`);
  } catch (error) {
    if (error instanceof AbsenceAccessError) {
      notFound();
    }
    throw error;
  }
}

export async function archiveCancellationAction(
  _prev: AbsenceActionState,
  formData: FormData,
): Promise<AbsenceActionState> {
  const user = await requireTenant();
  const absenceId = String(formData.get("absenceId") ?? "");
  if (!absenceId) {
    notFound();
  }

  const parsed = parseArchiveCancellationFormData(formData);
  if (!parsed.success) {
    return {
      error: FORM_CHECK_MESSAGE,
      fieldErrors: flattenFieldErrors(parsed.error),
    };
  }

  try {
    const existing = await prisma.absence.findFirst({
      where: { id: absenceId, tenantId: user.tenantId },
      select: { staffId: true },
    });
    const result = await archiveCancellation(prisma, {
      tenantId: user.tenantId,
      userId: user.id,
      absenceId,
      input: parsed.data,
    });

    if (!result.ok) {
      return { error: result.error, fieldErrors: result.fieldErrors };
    }

    revalidatePath(`/absence/${result.id}`);
    if (existing?.staffId) {
      revalidatePath(`/staff/${existing.staffId}`);
    }
    redirect(`/absence/${result.id}?archived=1`);
  } catch (error) {
    if (error instanceof AbsenceAccessError) {
      notFound();
    }
    throw error;
  }
}
