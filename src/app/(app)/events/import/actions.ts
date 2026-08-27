"use server";

import { revalidatePath } from "next/cache";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { notFound, redirect } from "next/navigation";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { EventAccessError } from "@/lib/events/errors";
import {
  cancelImport,
  confirmImportEvents,
  confirmImportVenues,
  createImportFromUpload,
} from "@/lib/events/import/service";

export type ImportActionState = {
  error?: string;
};

async function readUploadFile(formData: FormData): Promise<
  | { ok: true; fileName: string; bytes: Uint8Array }
  | { ok: false; error: string }
> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose an .xlsx or CSV file to upload." };
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  return { ok: true, fileName: file.name, bytes: buffer };
}

export async function uploadImportAction(
  _prev: ImportActionState,
  formData: FormData,
): Promise<ImportActionState> {
  const user = await requireTenant();
  const uploaded = await readUploadFile(formData);
  if (!uploaded.ok) {
    return { error: uploaded.error };
  }

  const replaceImportId = String(formData.get("replaceImportId") ?? "");
  if (replaceImportId) {
    try {
      await cancelImport(prisma, {
        tenantId: user.tenantId,
        importId: replaceImportId,
      });
    } catch (error) {
      if (error instanceof EventAccessError) {
        notFound();
      }
      throw error;
    }
  }

  try {
    const result = await createImportFromUpload(prisma, {
      tenantId: user.tenantId,
      userId: user.id,
      fileName: uploaded.fileName,
      bytes: uploaded.bytes,
    });
    if (!result.ok) {
      return { error: result.error };
    }
    revalidatePath("/events");
    const href = result.repeatWarning
      ? `${result.href}?repeat=1`
      : result.href;
    redirect(href);
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    if (error instanceof EventAccessError) {
      notFound();
    }
    console.error("Event import upload failed", error);
    return {
      error: "The file could not be checked. Please try uploading it again.",
    };
  }
}

export async function confirmImportVenuesAction(
  _prev: ImportActionState,
  formData: FormData,
): Promise<ImportActionState> {
  const user = await requireTenant();
  const importId = String(formData.get("importId") ?? "");
  if (!importId) {
    notFound();
  }

  try {
    const result = await confirmImportVenues(prisma, {
      tenantId: user.tenantId,
      importId,
    });
    if (!result.ok) {
      return { error: result.error };
    }
    revalidatePath("/events");
    revalidatePath("/settings/events");
    redirect(result.href);
  } catch (error) {
    if (error instanceof EventAccessError) {
      notFound();
    }
    throw error;
  }
}

export async function confirmImportEventsAction(
  _prev: ImportActionState,
  formData: FormData,
): Promise<ImportActionState> {
  const user = await requireTenant();
  const importId = String(formData.get("importId") ?? "");
  if (!importId) {
    notFound();
  }

  try {
    const result = await confirmImportEvents(prisma, {
      tenantId: user.tenantId,
      userId: user.id,
      importId,
    });
    if (!result.ok) {
      return { error: result.error };
    }
    revalidatePath("/events");
    redirect(result.href);
  } catch (error) {
    if (error instanceof EventAccessError) {
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
      redirect(`/events/import/${importId}?error=1`);
    }
    revalidatePath("/events");
    redirect("/events/import");
  } catch (error) {
    if (error instanceof EventAccessError) {
      notFound();
    }
    throw error;
  }
}
