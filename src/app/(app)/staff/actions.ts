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
import {
  amendProbationEndDate,
  restartStaffProbation,
  reviewStaffProbation,
} from "@/lib/staff/probation-service";
import {
  parseAmendProbationEndFormData,
  parseReviewProbationFormData,
  parseSnoozeProbationTaskFormData,
} from "@/lib/staff/review-schema";
import {
  acknowledgeProbationTask,
  snoozeProbationTask,
} from "@/lib/staff/tasks";

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

function revalidateProbationPaths(staffId: string) {
  revalidatePath("/staff");
  revalidatePath("/staff/probation");
  revalidatePath(`/staff/${staffId}`);
  revalidatePath(`/staff/${staffId}/edit`);
  revalidatePath(`/staff/${staffId}/probation/review`);
  revalidatePath(`/staff/${staffId}/probation/amend`);
}

export type ProbationActionState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export async function reviewProbationAction(
  _prev: ProbationActionState,
  formData: FormData,
): Promise<ProbationActionState> {
  const user = await requireTenant();
  const staffId = String(formData.get("staffId") ?? "");
  if (!staffId) {
    notFound();
  }
  const parsed = parseReviewProbationFormData(formData);
  if (!parsed.success) {
    return {
      error: FORM_CHECK_MESSAGE,
      fieldErrors: flattenFieldErrors(parsed.error),
    };
  }
  try {
    const result = await reviewStaffProbation(prisma, {
      tenantId: user.tenantId,
      userId: user.id,
      staffId,
      outcome: parsed.data.outcome,
      reviewDate: parsed.data.reviewDate,
      notes: parsed.data.notes,
      newEndDate: parsed.data.newEndDate,
    });
    if (!result.ok) {
      return { error: result.error, fieldErrors: result.fieldErrors };
    }
    revalidateProbationPaths(staffId);
    redirect(`/staff/${staffId}?reviewed=1`);
  } catch (error) {
    if (error instanceof StaffAccessError) {
      notFound();
    }
    throw error;
  }
}

export async function amendProbationEndAction(
  _prev: ProbationActionState,
  formData: FormData,
): Promise<ProbationActionState> {
  const user = await requireTenant();
  const staffId = String(formData.get("staffId") ?? "");
  if (!staffId) {
    notFound();
  }
  const parsed = parseAmendProbationEndFormData(formData);
  if (!parsed.success) {
    return {
      error: FORM_CHECK_MESSAGE,
      fieldErrors: flattenFieldErrors(parsed.error),
    };
  }
  try {
    const result = await amendProbationEndDate(prisma, {
      tenantId: user.tenantId,
      userId: user.id,
      staffId,
      newEndDate: parsed.data.newEndDate,
      reason: parsed.data.reason,
    });
    if (!result.ok) {
      return { error: result.error, fieldErrors: result.fieldErrors };
    }
    revalidateProbationPaths(staffId);
    redirect(`/staff/${staffId}?amended=1`);
  } catch (error) {
    if (error instanceof StaffAccessError) {
      notFound();
    }
    throw error;
  }
}

export async function acknowledgeProbationTaskAction(formData: FormData) {
  const user = await requireTenant();
  const taskId = String(formData.get("taskId") ?? "");
  const staffId = String(formData.get("staffId") ?? "");
  if (!taskId) {
    notFound();
  }
  try {
    const result = await acknowledgeProbationTask(prisma, {
      tenantId: user.tenantId,
      userId: user.id,
      taskId,
    });
    if (!result.ok) {
      redirect(
        staffId
          ? `/staff/${staffId}?taskError=1`
          : "/staff/probation?taskError=1",
      );
    }
    revalidateProbationPaths(staffId || "");
    redirect(
      staffId ? `/staff/${staffId}?acknowledged=1` : "/staff/probation?acknowledged=1",
    );
  } catch (error) {
    if (error instanceof StaffAccessError) {
      notFound();
    }
    throw error;
  }
}

export async function snoozeProbationTaskAction(
  _prev: ProbationActionState,
  formData: FormData,
): Promise<ProbationActionState> {
  const user = await requireTenant();
  const taskId = String(formData.get("taskId") ?? "");
  const staffId = String(formData.get("staffId") ?? "");
  if (!taskId) {
    notFound();
  }
  const parsed = parseSnoozeProbationTaskFormData(formData);
  if (!parsed.success) {
    return {
      error: FORM_CHECK_MESSAGE,
      fieldErrors: flattenFieldErrors(parsed.error),
    };
  }
  try {
    const result = await snoozeProbationTask(prisma, {
      tenantId: user.tenantId,
      userId: user.id,
      taskId,
      snoozedUntil: parsed.data.snoozedUntil,
      reason: parsed.data.reason,
    });
    if (!result.ok) {
      return { error: result.error, fieldErrors: result.fieldErrors };
    }
    revalidateProbationPaths(staffId);
    redirect(
      staffId ? `/staff/${staffId}?snoozed=1` : "/staff/probation?snoozed=1",
    );
  } catch (error) {
    if (error instanceof StaffAccessError) {
      notFound();
    }
    throw error;
  }
}

export async function restartStaffProbationAction(
  _prev: ProbationActionState,
  formData: FormData,
): Promise<ProbationActionState> {
  const user = await requireTenant();
  const staffId = String(formData.get("staffId") ?? "");
  if (!staffId) {
    notFound();
  }
  try {
    const result = await restartStaffProbation(prisma, {
      tenantId: user.tenantId,
      userId: user.id,
      staffId,
    });
    if (!result.ok) {
      return { error: result.error, fieldErrors: result.fieldErrors };
    }
    revalidateProbationPaths(staffId);
    redirect(`/staff/${staffId}?restarted=1`);
  } catch (error) {
    if (error instanceof StaffAccessError) {
      notFound();
    }
    throw error;
  }
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
