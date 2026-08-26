"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { EventAccessError } from "@/lib/events/errors";
import { flattenFieldErrors, parseVenueFormData } from "@/lib/events/schema";
import { createVenue, updateVenue } from "@/lib/events/venues";

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
      error: "Check the form and try again.",
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
      error: "Check the form and try again.",
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
