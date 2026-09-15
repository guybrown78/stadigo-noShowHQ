"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { AbsenceAccessError } from "@/lib/absence/errors";
import {
  getTenantTimezone,
  searchEventsForAbsence,
  searchStaffForAbsence,
  type AbsenceEventOption,
  type AbsenceEventSearchMode,
  type AbsenceStaffOption,
} from "@/lib/absence/queries";
import {
  flattenFieldErrors,
  parseArchiveAwolFormData,
  parseArchiveCancellationFormData,
  parseArchiveSicknessFormData,
  parseAwolFormData,
  parseCancellationFormData,
  parseCorrectAwolFormData,
  parseCorrectCancellationFormData,
  parseCorrectSicknessFormData,
  parseSicknessFormData,
} from "@/lib/absence/schema";
import {
  archiveAwol,
  archiveCancellation,
  archiveSickness,
  correctAwol,
  correctCancellation,
  correctSickness,
  createAwol,
  createCancellation,
  createSickness,
} from "@/lib/absence/service";
import { todayIsoInTimeZone } from "@/lib/absence/timezone";
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
  mode: AbsenceEventSearchMode = "cancellation",
): Promise<AbsenceEventOption[]> {
  const user = await requireTenant();
  let todayIso: string | undefined;
  if (mode === "awol") {
    try {
      const timeZone = await getTenantTimezone(prisma, user.tenantId);
      todayIso = todayIsoInTimeZone(timeZone);
    } catch {
      todayIso = undefined;
    }
  }
  return searchEventsForAbsence(prisma, user.tenantId, query, {
    mode,
    todayIso,
  });
}

function revalidateAbsence(resultId: string, staffId: string) {
  revalidatePath("/absence/new");
  revalidatePath(`/absence/${resultId}`);
  revalidatePath(`/staff/${staffId}`);
  revalidatePath("/ledger");
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

  revalidateAbsence(result.id, parsed.data.staffId);
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

    revalidateAbsence(result.id, parsed.data.staffId);
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
    revalidatePath("/ledger");
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

export async function createAwolAction(
  _prev: AbsenceActionState,
  formData: FormData,
): Promise<AbsenceActionState> {
  const user = await requireTenant();
  const parsed = parseAwolFormData(formData);
  if (!parsed.success) {
    return {
      error: FORM_CHECK_MESSAGE,
      fieldErrors: flattenFieldErrors(parsed.error),
    };
  }

  const result = await createAwol(prisma, {
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

  revalidateAbsence(result.id, parsed.data.staffId);
  redirect(`/absence/${result.id}?created=1`);
}

export async function correctAwolAction(
  _prev: AbsenceActionState,
  formData: FormData,
): Promise<AbsenceActionState> {
  const user = await requireTenant();
  const absenceId = String(formData.get("absenceId") ?? "");
  if (!absenceId) {
    notFound();
  }

  const parsed = parseCorrectAwolFormData(formData);
  if (!parsed.success) {
    return {
      error: FORM_CHECK_MESSAGE,
      fieldErrors: flattenFieldErrors(parsed.error),
    };
  }

  try {
    const result = await correctAwol(prisma, {
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

    revalidateAbsence(result.id, parsed.data.staffId);
    redirect(`/absence/${result.id}?updated=1`);
  } catch (error) {
    if (error instanceof AbsenceAccessError) {
      notFound();
    }
    throw error;
  }
}

export async function archiveAwolAction(
  _prev: AbsenceActionState,
  formData: FormData,
): Promise<AbsenceActionState> {
  const user = await requireTenant();
  const absenceId = String(formData.get("absenceId") ?? "");
  if (!absenceId) {
    notFound();
  }

  const parsed = parseArchiveAwolFormData(formData);
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
    const result = await archiveAwol(prisma, {
      tenantId: user.tenantId,
      userId: user.id,
      absenceId,
      input: parsed.data,
    });

    if (!result.ok) {
      return { error: result.error, fieldErrors: result.fieldErrors };
    }

    revalidatePath(`/absence/${result.id}`);
    revalidatePath("/ledger");
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

export async function createSicknessAction(
  _prev: AbsenceActionState,
  formData: FormData,
): Promise<AbsenceActionState> {
  const user = await requireTenant();
  const parsed = parseSicknessFormData(formData);
  if (!parsed.success) {
    return {
      error: FORM_CHECK_MESSAGE,
      fieldErrors: flattenFieldErrors(parsed.error),
    };
  }

  const result = await createSickness(prisma, {
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

  revalidateAbsence(result.id, parsed.data.staffId);
  redirect(`/absence/${result.id}?created=1`);
}

export async function correctSicknessAction(
  _prev: AbsenceActionState,
  formData: FormData,
): Promise<AbsenceActionState> {
  const user = await requireTenant();
  const absenceId = String(formData.get("absenceId") ?? "");
  if (!absenceId) {
    notFound();
  }

  const parsed = parseCorrectSicknessFormData(formData);
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
    const result = await correctSickness(prisma, {
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

    revalidateAbsence(result.id, parsed.data.staffId);
    if (existing?.staffId && existing.staffId !== parsed.data.staffId) {
      revalidatePath(`/staff/${existing.staffId}`);
    }
    redirect(`/absence/${result.id}?updated=1`);
  } catch (error) {
    if (error instanceof AbsenceAccessError) {
      notFound();
    }
    throw error;
  }
}

export async function archiveSicknessAction(
  _prev: AbsenceActionState,
  formData: FormData,
): Promise<AbsenceActionState> {
  const user = await requireTenant();
  const absenceId = String(formData.get("absenceId") ?? "");
  if (!absenceId) {
    notFound();
  }

  const parsed = parseArchiveSicknessFormData(formData);
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
    const result = await archiveSickness(prisma, {
      tenantId: user.tenantId,
      userId: user.id,
      absenceId,
      input: parsed.data,
    });

    if (!result.ok) {
      return { error: result.error, fieldErrors: result.fieldErrors };
    }

    revalidatePath(`/absence/${result.id}`);
    revalidatePath("/ledger");
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
