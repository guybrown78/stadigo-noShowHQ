"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { EventAccessError } from "@/lib/events/errors";
import { flattenFieldErrors, parseEventFormData } from "@/lib/events/schema";
import { createEvent, deleteEvent, updateEvent } from "@/lib/events/service";

export type EventActionState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export async function createEventAction(
  _prev: EventActionState,
  formData: FormData,
): Promise<EventActionState> {
  const user = await requireTenant();
  const parsed = parseEventFormData(formData);

  if (!parsed.success) {
    return {
      error: "Check the form and try again.",
      fieldErrors: flattenFieldErrors(parsed.error),
    };
  }

  const result = await createEvent(prisma, {
    tenantId: user.tenantId,
    userId: user.id,
    input: parsed.data,
  });

  if (!result.ok) {
    return { error: result.error, fieldErrors: result.fieldErrors };
  }

  revalidatePath("/events");
  redirect(`/events/${result.id}?created=1`);
}

export async function updateEventAction(
  _prev: EventActionState,
  formData: FormData,
): Promise<EventActionState> {
  const user = await requireTenant();
  const eventId = String(formData.get("eventId") ?? "");
  if (!eventId) {
    notFound();
  }

  const parsed = parseEventFormData(formData);
  if (!parsed.success) {
    return {
      error: "Check the form and try again.",
      fieldErrors: flattenFieldErrors(parsed.error),
    };
  }

  try {
    const result = await updateEvent(prisma, {
      tenantId: user.tenantId,
      userId: user.id,
      eventId,
      input: parsed.data,
    });

    if (!result.ok) {
      return { error: result.error, fieldErrors: result.fieldErrors };
    }

    revalidatePath("/events");
    revalidatePath(`/events/${result.id}`);
    redirect(`/events/${result.id}?updated=1`);
  } catch (error) {
    if (error instanceof EventAccessError) {
      notFound();
    }
    throw error;
  }
}

export async function deleteEventAction(formData: FormData) {
  const user = await requireTenant();
  const eventId = String(formData.get("eventId") ?? "");
  if (!eventId) {
    notFound();
  }

  try {
    await deleteEvent(prisma, {
      tenantId: user.tenantId,
      userId: user.id,
      eventId,
    });
  } catch (error) {
    if (error instanceof EventAccessError) {
      notFound();
    }
    throw error;
  }

  revalidatePath("/events");
  redirect("/events?deleted=1");
}
