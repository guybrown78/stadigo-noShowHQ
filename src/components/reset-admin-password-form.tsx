"use client";

import { useActionState, useMemo } from "react";
import {
  resetTenantAdminPasswordAction,
  type ResetPasswordActionState,
} from "@/app/(platform)/admin/actions";
import {
  FieldError,
  FormAlert,
  FormSuccess,
  controlClassName,
} from "@/components/form";
import { withClientValidation } from "@/lib/form";
import { parseResetTenantAdminPasswordFormData } from "@/lib/tenants/schema";

const initial: ResetPasswordActionState = {};

export function ResetAdminPasswordForm({
  tenantId,
  userId,
  userLabel,
}: {
  tenantId: string;
  userId: string;
  userLabel: string;
}) {
  const validatedAction = useMemo(
    () =>
      withClientValidation(
        parseResetTenantAdminPasswordFormData,
        resetTenantAdminPasswordAction,
      ),
    [],
  );
  const [state, formAction, pending] = useActionState(
    validatedAction,
    initial,
  );

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-4"
      noValidate
    >
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="userId" value={userId} />
      <p className="text-sm font-medium text-slate-900">
        Reset password for {userLabel}
      </p>

      <FormAlert>{state.error}</FormAlert>
      <FormSuccess>{state.success}</FormSuccess>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label
            htmlFor={`newPassword-${userId}`}
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            New temporary password
          </label>
          <input
            id={`newPassword-${userId}`}
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            aria-invalid={Boolean(state.fieldErrors?.newPassword)}
            aria-describedby={
              state.fieldErrors?.newPassword
                ? `newPassword-${userId}-error`
                : undefined
            }
            className={controlClassName("w-full bg-white")}
          />
          <FieldError
            id={`newPassword-${userId}-error`}
            messages={state.fieldErrors?.newPassword}
          />
        </div>
        <div>
          <label
            htmlFor={`confirmPassword-${userId}`}
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Confirm password
          </label>
          <input
            id={`confirmPassword-${userId}`}
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            aria-invalid={Boolean(state.fieldErrors?.confirmPassword)}
            aria-describedby={
              state.fieldErrors?.confirmPassword
                ? `confirmPassword-${userId}-error`
                : undefined
            }
            className={controlClassName("w-full bg-white")}
          />
          <FieldError
            id={`confirmPassword-${userId}-error`}
            messages={state.fieldErrors?.confirmPassword}
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Updating…" : "Set temporary password"}
      </button>
    </form>
  );
}
