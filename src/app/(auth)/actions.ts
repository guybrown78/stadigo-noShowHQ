"use server";

import { signOut } from "@/auth";
import { clearActingTenantId } from "@/lib/acting-tenant";

export type ActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string[]>;
};

export async function logoutAction() {
  await clearActingTenantId();
  await signOut({ redirectTo: "/login" });
}
