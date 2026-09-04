"use server";

import { revalidatePath } from "next/cache";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { notFound, redirect } from "next/navigation";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { StaffAccessError } from "@/lib/staff/errors";
import {
  cancelImport,
  confirmStaffImport,
  createImportFromUpload,
} from "@/lib/staff/import/service";
import { parseImportUploadFormData } from "@/lib/staff/import/upload";
import { FORM_CHECK_MESSAGE, flattenFieldErrors } from "@/lib/form";

export type ImportActionState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export async function uploadImportAction(
  _prev: ImportActionState,
  formData: FormData,
): Promise<ImportActionState> {
  const user = await requireTenant();
  const parsed = parseImportUploadFormData(formData);
  if (!parsed.success) {
    return {
      error: FORM_CHECK_MESSAGE,
      fieldErrors: flattenFieldErrors(parsed.error),
    };
  }

  const bytes = new Uint8Array(await parsed.data.file.arrayBuffer());
  const replaceImportId = parsed.data.replaceImportId;
  if (replaceImportId) {
    try {
      await cancelImport(prisma, {
        tenantId: user.tenantId,
        importId: replaceImportId,
      });
    } catch (error) {
      if (error instanceof StaffAccessError) {
        notFound();
      }
      throw error;
    }
  }

  try {
    const result = await createImportFromUpload(prisma, {
      tenantId: user.tenantId,
      userId: user.id,
      fileName: parsed.data.file.name,
      bytes,
    });
    if (!result.ok) {
      return { error: result.error };
    }
    revalidatePath("/staff");
    const href = result.repeatWarning
      ? `${result.href}?repeat=1`
      : result.href;
    redirect(href);
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    if (error instanceof StaffAccessError) {
      notFound();
    }
    console.error("Staff import upload failed", error);
    return {
      error: "The file could not be checked. Please try uploading it again.",
    };
  }
}

export async function confirmImportAction(
  _prev: ImportActionState,
  formData: FormData,
): Promise<ImportActionState> {
  const user = await requireTenant();
  const importId = String(formData.get("importId") ?? "");
  if (!importId) {
    notFound();
  }

  try {
    const result = await confirmStaffImport(prisma, {
      tenantId: user.tenantId,
      userId: user.id,
      importId,
    });
    if (!result.ok) {
      return { error: result.error };
    }
    revalidatePath("/staff");
    redirect(result.href);
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    if (error instanceof StaffAccessError) {
      notFound();
    }
    throw error;
  }
}

export async function cancelImportAction(formData: FormData) {
  const user = await requireTenant();
  const importId = String(formData.get("importId") ?? "");
  if (!importId) {
    notFound();
  }

  try {
    const result = await cancelImport(prisma, {
      tenantId: user.tenantId,
      importId,
    });
    if (!result.ok) {
      redirect(`/staff/import/${importId}?error=1`);
    }
    revalidatePath("/staff");
    redirect("/staff/import");
  } catch (error) {
    if (error instanceof StaffAccessError) {
      notFound();
    }
    throw error;
  }
}
