import { z } from "zod";

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const createTenantSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, "Slug must be at least 2 characters")
    .max(60)
    .regex(slugRegex, "Use lowercase letters, numbers, and hyphens only"),
  adminFirstName: z.string().trim().min(1, "First name is required").max(50),
  adminLastName: z.string().trim().min(1, "Last name is required").max(50),
  adminEmail: z.string().trim().email("Enter a valid email address"),
  adminPassword: z.string().min(8, "Password must be at least 8 characters"),
});

export const resetTenantAdminPasswordSchema = z
  .object({
    tenantId: z.string().min(1),
    userId: z.string().min(1),
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Confirm the new password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export function parseCreateTenantFormData(formData: FormData) {
  return createTenantSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    adminFirstName: formData.get("adminFirstName"),
    adminLastName: formData.get("adminLastName"),
    adminEmail: formData.get("adminEmail"),
    adminPassword: formData.get("adminPassword"),
  });
}

export function parseResetTenantAdminPasswordFormData(formData: FormData) {
  return resetTenantAdminPasswordSchema.safeParse({
    tenantId: formData.get("tenantId"),
    userId: formData.get("userId"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
}
