"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { FORM_CHECK_MESSAGE } from "@/lib/form";
import { StaffAccessError } from "@/lib/staff/errors";
import {
  searchActiveStaffForTenant,
  type ManagerOption,
} from "@/lib/staff/queries";
import { flattenFieldErrors, parseStaffFormData } from "@/lib/staff/schema";
import { createStaff, deleteStaff, updateStaff } from "@/lib/staff/service";

export type StaffActionState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export async function createStaffAction(
  _prev: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const user = await requireTenant();
  const parsed = parseStaffFormData(formData);

  if (!parsed.success) {
    return {
      error: FORM_CHECK_MESSAGE,
      fieldErrors: flattenFieldErrors(parsed.error),
    };
  }

  const result = await createStaff(prisma, {
    tenantId: user.tenantId,
    userId: user.id,
    input: parsed.data,
  });

  if (!result.ok) {
    return { error: result.error, fieldErrors: result.fieldErrors };
  }

  revalidatePath("/staff");
  redirect(`/staff/${result.id}?created=1`);
}

export async function updateStaffAction(
  _prev: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const user = await requireTenant();
  const staffId = String(formData.get("staffId") ?? "");
  if (!staffId) {
    notFound();
  }

  const parsed = parseStaffFormData(formData);
  if (!parsed.success) {
    return {
      error: FORM_CHECK_MESSAGE,
      fieldErrors: flattenFieldErrors(parsed.error),
    };
  }

  try {
    const result = await updateStaff(prisma, {
      tenantId: user.tenantId,
      userId: user.id,
      staffId,
      input: parsed.data,
    });

    if (!result.ok) {
      return { error: result.error, fieldErrors: result.fieldErrors };
    }

    revalidatePath("/staff");
    revalidatePath(`/staff/${result.id}`);
    redirect(`/staff/${result.id}?updated=1`);
  } catch (error) {
    if (error instanceof StaffAccessError) {
      notFound();
    }
    throw error;
  }
}

export async function deleteStaffAction(formData: FormData) {
  const user = await requireTenant();
  const staffId = String(formData.get("staffId") ?? "");
  if (!staffId) {
    notFound();
  }

  try {
    await deleteStaff(prisma, {
      tenantId: user.tenantId,
      userId: user.id,
      staffId,
    });
  } catch (error) {
    if (error instanceof StaffAccessError) {
      notFound();
    }
    throw error;
  }

  revalidatePath("/staff");
  redirect("/staff?deleted=1");
}

export async function searchStaffManagersAction(
  query: string,
  excludeId?: string,
): Promise<ManagerOption[]> {
  const user = await requireTenant();
  return searchActiveStaffForTenant(prisma, user.tenantId, {
    q: query,
    excludeId,
  });
}
