"use server";

import { signOut } from "@/auth";
import { clearActingTenantId } from "@/lib/acting-tenant";
import { clearColorScheme } from "@/lib/color-scheme";

export type ActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string[]>;
};

export async function logoutAction() {
  await clearActingTenantId();
  await clearColorScheme();
  await signOut({ redirectTo: "/login" });
}
