"use server";

import { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  clearActingTenantId,
  setActingTenantId,
} from "@/lib/acting-tenant";
import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";

export type TenantActionState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const createTenantSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, "Slug must be at least 2 characters")
    .max(60)
    .regex(slugRegex, "Use lowercase letters, numbers, and hyphens only"),
  adminFirstName: z
    .string()
    .trim()
    .min(1, "First name is required")
    .max(50),
  adminLastName: z.string().trim().min(1, "Last name is required").max(50),
  adminEmail: z.string().trim().email("Enter a valid email address"),
  adminPassword: z
    .string()
    .min(8, "Password must be at least 8 characters"),
});

export async function createTenantAction(
  _prev: TenantActionState,
  formData: FormData,
): Promise<TenantActionState> {
  await requireRole(Role.SUPER_ADMIN);

  const parsed = createTenantSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    adminFirstName: formData.get("adminFirstName"),
    adminLastName: formData.get("adminLastName"),
    adminEmail: formData.get("adminEmail"),
    adminPassword: formData.get("adminPassword"),
  });

  if (!parsed.success) {
    return {
      error: "Check the form and try again.",
      fieldErrors: parsed.error.flatten().fieldErrors,
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

const resetTenantAdminPasswordSchema = z.object({
  tenantId: z.string().min(1),
  userId: z.string().min(1),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(1, "Confirm the new password"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export async function resetTenantAdminPasswordAction(
  _prev: ResetPasswordActionState,
  formData: FormData,
): Promise<ResetPasswordActionState> {
  await requireRole(Role.SUPER_ADMIN);

  const parsed = resetTenantAdminPasswordSchema.safeParse({
    tenantId: formData.get("tenantId"),
    userId: formData.get("userId"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return {
      error: "Check the form and try again.",
      fieldErrors: parsed.error.flatten().fieldErrors,
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
