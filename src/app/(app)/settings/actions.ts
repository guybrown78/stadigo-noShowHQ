"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";

export type ProfileActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string[]>;
};

const profileSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, "First name is required")
    .max(50, "First name is too long"),
  lastName: z
    .string()
    .trim()
    .min(1, "Last name is required")
    .max(50, "Last name is too long"),
});

export async function updateProfileAction(
  _prev: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const user = await requireTenant();

  const parsed = profileSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
  });

  if (!parsed.success) {
    return {
      error: "Check the form and try again.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        name: `${parsed.data.firstName} ${parsed.data.lastName}`,
      },
    });
  } catch {
    return { error: "Could not save your profile. Please try again." };
  }

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { success: "Profile updated." };
}

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Confirm your new password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "Choose a password that is different from your current one",
    path: ["newPassword"],
  });

export async function updatePasswordAction(
  _prev: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const sessionUser = await requireTenant();

  const parsed = passwordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return {
      error: "Check the form and try again.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const record = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { id: true, passwordHash: true },
  });

  if (!record) {
    return { error: "Could not update your password. Please try again." };
  }

  const currentValid = await verifyPassword(
    parsed.data.currentPassword,
    record.passwordHash,
  );
  if (!currentValid) {
    return {
      error: "Current password is incorrect.",
      fieldErrors: { currentPassword: ["Current password is incorrect"] },
    };
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);

  try {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.id },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.deleteMany({
        where: { userId: record.id },
      }),
    ]);
  } catch {
    return { error: "Could not update your password. Please try again." };
  }

  revalidatePath("/settings");
  return { success: "Password updated." };
}
