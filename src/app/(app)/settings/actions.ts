"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { EventAccessError } from "@/lib/events/errors";
import { flattenFieldErrors, parseVenueFormData } from "@/lib/events/schema";
import { FORM_CHECK_MESSAGE } from "@/lib/form";
import { createVenue, updateVenue } from "@/lib/events/venues";
import { StaffAccessError } from "@/lib/staff/errors";
import {
  flattenFieldErrors as flattenStaffFieldErrors,
  parseTenantProbationSettingsFormData,
} from "@/lib/staff/review-schema";
import { updateTenantProbationDefault } from "@/lib/staff/settings";
import {
  applySicknessEvidenceBackfill,
  updateSicknessEvidenceSettings,
} from "@/lib/absence/evidence-settings";
import { parseSicknessEvidenceSettingsFormData } from "@/lib/absence/evidence-settings-schema";

export type VenueActionState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

function revalidateVenuePaths() {
  revalidatePath("/settings/events");
  revalidatePath("/events");
}

export async function createVenueAction(
  _prev: VenueActionState,
  formData: FormData,
): Promise<VenueActionState> {
  const user = await requireTenant();
  const parsed = parseVenueFormData(formData);

  if (!parsed.success) {
    return {
      error: FORM_CHECK_MESSAGE,
      fieldErrors: flattenFieldErrors(parsed.error),
    };
  }

  const result = await createVenue(prisma, {
    tenantId: user.tenantId,
    input: { ...parsed.data, active: true },
  });

  if (!result.ok) {
    return { error: result.error, fieldErrors: result.fieldErrors };
  }

  revalidateVenuePaths();
  redirect("/settings/events?created=1");
}

export async function updateVenueAction(
  _prev: VenueActionState,
  formData: FormData,
): Promise<VenueActionState> {
  const user = await requireTenant();
  const venueId = String(formData.get("venueId") ?? "");
  if (!venueId) {
    notFound();
  }

  const parsed = parseVenueFormData(formData);
  if (!parsed.success) {
    return {
      error: FORM_CHECK_MESSAGE,
      fieldErrors: flattenFieldErrors(parsed.error),
    };
  }

  try {
    const result = await updateVenue(prisma, {
      tenantId: user.tenantId,
      venueId,
      input: parsed.data,
    });

    if (!result.ok) {
      return { error: result.error, fieldErrors: result.fieldErrors };
    }

    revalidateVenuePaths();
    redirect("/settings/events?updated=1");
  } catch (error) {
    if (error instanceof EventAccessError) {
      notFound();
    }
    throw error;
  }
}

export type ProbationSettingsActionState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export async function updateProbationSettingsAction(
  _prev: ProbationSettingsActionState,
  formData: FormData,
): Promise<ProbationSettingsActionState> {
  const user = await requireTenant();
  const parsed = parseTenantProbationSettingsFormData(formData);
  if (!parsed.success) {
    return {
      error: FORM_CHECK_MESSAGE,
      fieldErrors: flattenStaffFieldErrors(parsed.error),
    };
  }

  try {
    const result = await updateTenantProbationDefault(prisma, {
      tenantId: user.tenantId,
      userId: user.id,
      days: parsed.data.defaultProbationDays,
    });
    if (!result.ok) {
      return { error: result.error, fieldErrors: result.fieldErrors };
    }
    revalidatePath("/settings/probation");
    revalidatePath("/staff/new");
    redirect("/settings/probation?updated=1");
  } catch (error) {
    if (error instanceof StaffAccessError) {
      notFound();
    }
    throw error;
  }
}

export type SicknessEvidenceSettingsActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string[]>;
  values?: {
    fitNoteRequiredFromDay: string;
    fitNoteChaseAfterDays: string;
  };
};

export async function updateSicknessEvidenceSettingsAction(
  _prev: SicknessEvidenceSettingsActionState,
  formData: FormData,
): Promise<SicknessEvidenceSettingsActionState> {
  const user = await requireTenant();
  const values = {
    fitNoteRequiredFromDay: String(formData.get("fitNoteRequiredFromDay") ?? ""),
    fitNoteChaseAfterDays: String(formData.get("fitNoteChaseAfterDays") ?? ""),
  };
  const parsed = parseSicknessEvidenceSettingsFormData(formData);
  if (!parsed.success) {
    return {
      error: FORM_CHECK_MESSAGE,
      fieldErrors: flattenFieldErrors(parsed.error),
      values,
    };
  }

  const result = await updateSicknessEvidenceSettings(prisma, {
    tenantId: user.tenantId,
    userId: user.id,
    requiredFromDay: parsed.data.fitNoteRequiredFromDay,
    chaseAfterDays: parsed.data.fitNoteChaseAfterDays,
  });
  if (!result.ok) {
    return {
      error: result.error,
      fieldErrors: result.fieldErrors,
      values,
    };
  }
  revalidatePath("/settings/sickness-evidence");
  redirect("/settings/sickness-evidence?updated=1");
}

export async function applySicknessEvidenceBackfillAction(
  _prev: SicknessEvidenceSettingsActionState,
  formData: FormData,
): Promise<SicknessEvidenceSettingsActionState> {
  const user = await requireTenant();
  if (formData.get("confirmBackfill") !== "yes") {
    return {
      error: "Tick the box before applying.",
    };
  }
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "").trim();
  if (idempotencyKey.length < 8 || idempotencyKey.length > 128) {
    return { error: "Refresh the page and try again." };
  }
  const result = await applySicknessEvidenceBackfill(prisma, {
    tenantId: user.tenantId,
    userId: user.id,
    idempotencyKey,
  });
  if (!result.ok) {
    return { error: result.error };
  }
  revalidatePath("/settings/sickness-evidence");
  revalidatePath("/follow-ups");
  revalidatePath("/ledger");
  redirect("/settings/sickness-evidence?backfill=1");
}
