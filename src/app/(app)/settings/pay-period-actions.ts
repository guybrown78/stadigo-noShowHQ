"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { FORM_CHECK_MESSAGE, flattenFieldErrors, type FormState } from "@/lib/form";
import { parsePayPeriodDatesFormData } from "@/lib/absence/pay-period-schema";
import {
  openPayPeriod,
  startNextPayPeriod,
  updateOpenPayPeriod,
} from "@/lib/absence/pay-periods";

export type PayPeriodActionState = FormState & { ok?: boolean };

async function saveDates(
  formData: FormData,
  write: (input: {
    tenantId: string;
    userId: string;
    startsOn: string;
    endsOn: string;
  }) => Promise<{ ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string[]> }>,
): Promise<PayPeriodActionState> {
  const user = await requireTenant();
  const parsed = parsePayPeriodDatesFormData(formData);
  if (!parsed.success) {
    return {
      error: FORM_CHECK_MESSAGE,
      fieldErrors: flattenFieldErrors(parsed.error),
    };
  }
  const result = await write({
    tenantId: user.tenantId,
    userId: user.id,
    startsOn: parsed.data.startsOn,
    endsOn: parsed.data.endsOn,
  });
  if (!result.ok) {
    return { error: result.error, fieldErrors: result.fieldErrors };
  }
  revalidatePath("/settings/pay-periods");
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/ledger");
  revalidatePath("/absence/new");
  return { ok: true };
}

export async function openPayPeriodAction(
  _prev: PayPeriodActionState,
  formData: FormData,
): Promise<PayPeriodActionState> {
  return saveDates(formData, (input) => openPayPeriod(prisma, input));
}

export async function updateOpenPayPeriodAction(
  _prev: PayPeriodActionState,
  formData: FormData,
): Promise<PayPeriodActionState> {
  return saveDates(formData, (input) => updateOpenPayPeriod(prisma, input));
}

export async function startNextPayPeriodAction(
  _prev: PayPeriodActionState,
  formData: FormData,
): Promise<PayPeriodActionState> {
  return saveDates(formData, (input) => startNextPayPeriod(prisma, input));
}
