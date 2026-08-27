"use server";

import { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  clearActingTenantId,
  setActingTenantId,
} from "@/lib/acting-tenant";
import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { provisionTenantEventCatalog } from "@/lib/events/provision";
import { FORM_CHECK_MESSAGE, flattenFieldErrors } from "@/lib/form";
import { hashPassword } from "@/lib/password";
import {
  parseCreateTenantFormData,
  parseResetTenantAdminPasswordFormData,
} from "@/lib/tenants/schema";

export type TenantActionState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export async function createTenantAction(
  _prev: TenantActionState,
  formData: FormData,
): Promise<TenantActionState> {
  await requireRole(Role.SUPER_ADMIN);

  const parsed = parseCreateTenantFormData(formData);

  if (!parsed.success) {
    return {
      error: FORM_CHECK_MESSAGE,
      fieldErrors: flattenFieldErrors(parsed.error),
    };
  }

  const data = parsed.data;
  const email = data.adminEmail.toLowerCase();

  const existingSlug = await prisma.tenant.findUnique({
    where: { slug: data.slug },
  });
  if (existingSlug) {
    return {
      error: "That slug is already in use.",
      fieldErrors: { slug: ["Slug already taken"] },
    };
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return {
      error: "That email is already in use.",
      fieldErrors: { adminEmail: ["Email already taken"] },
    };
  }

  const passwordHash = await hashPassword(data.adminPassword);

  try {
    await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: data.name,
          slug: data.slug,
        },
      });

      await tx.user.create({
        data: {
          email,
          firstName: data.adminFirstName,
          lastName: data.adminLastName,
          name: `${data.adminFirstName} ${data.adminLastName}`,
          passwordHash,
          role: Role.ADMIN,
          tenantId: tenant.id,
        },
      });

      await provisionTenantEventCatalog(tx, tenant);
    });
  } catch {
    return { error: "Could not create the tenant. Please try again." };
  }

  revalidatePath("/admin");
  redirect("/admin?created=1");
}

export async function enterTenantAction(formData: FormData) {
  await requireRole(Role.SUPER_ADMIN);

  const tenantId = String(formData.get("tenantId") ?? "");
  if (!tenantId) {
    redirect("/admin");
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true },
  });

  if (!tenant) {
    redirect("/admin");
  }

  await setActingTenantId(tenant.id);
  redirect("/dashboard");
}

export async function exitTenantAction() {
  await requireRole(Role.SUPER_ADMIN);
  await clearActingTenantId();
  redirect("/admin");
}

export type ResetPasswordActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string[]>;
};

export async function resetTenantAdminPasswordAction(
  _prev: ResetPasswordActionState,
  formData: FormData,
): Promise<ResetPasswordActionState> {
  await requireRole(Role.SUPER_ADMIN);

  const parsed = parseResetTenantAdminPasswordFormData(formData);

  if (!parsed.success) {
    return {
      error: FORM_CHECK_MESSAGE,
      fieldErrors: flattenFieldErrors(parsed.error),
    };
  }

  const { tenantId, userId, newPassword } = parsed.data;

  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      tenantId,
      role: Role.ADMIN,
    },
    select: { id: true, email: true },
  });

  if (!user) {
    return { error: "That tenant admin could not be found." };
  }

  const passwordHash = await hashPassword(newPassword);

  try {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.deleteMany({
        where: { userId: user.id },
      }),
    ]);
  } catch {
    return { error: "Could not reset the password. Please try again." };
  }

  revalidatePath(`/admin/tenants/${tenantId}`);
  return {
    success: `Password updated for ${user.email}. Share the new temporary password securely.`,
  };
}
