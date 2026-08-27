"use server";

import { revalidatePath } from "next/cache";
import {
  parsePasswordFormData,
  parseProfileFormData,
} from "@/lib/account/schema";
import { requireAuth } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { FORM_CHECK_MESSAGE, flattenFieldErrors } from "@/lib/form";
import { hashPassword, verifyPassword } from "@/lib/password";

export type ProfileActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string[]>;
};

export async function updateProfileAction(
  _prev: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const user = await requireAuth();

  const parsed = parseProfileFormData(formData);

  if (!parsed.success) {
    return {
      error: FORM_CHECK_MESSAGE,
      fieldErrors: flattenFieldErrors(parsed.error),
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

  revalidatePath("/profile");
  revalidatePath("/dashboard");
  revalidatePath("/admin");
  return { success: "Profile updated." };
}

export async function updatePasswordAction(
  _prev: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const sessionUser = await requireAuth();

  const parsed = parsePasswordFormData(formData);

  if (!parsed.success) {
    return {
      error: FORM_CHECK_MESSAGE,
      fieldErrors: flattenFieldErrors(parsed.error),
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

  revalidatePath("/profile");
  return { success: "Password updated." };
}
