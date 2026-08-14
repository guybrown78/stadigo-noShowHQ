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
