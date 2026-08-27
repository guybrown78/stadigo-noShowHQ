"use client";

import { useActionState, useId, useMemo } from "react";
import {
  updatePasswordAction,
  type ProfileActionState,
} from "@/app/profile/actions";
import {
  FieldError,
  FormAlert,
  FormSuccess,
  controlClassName,
} from "@/components/form";
import { parsePasswordFormData } from "@/lib/account/schema";
import { withClientValidation } from "@/lib/form";

const initial: ProfileActionState = {};

export function PasswordForm() {
  const formId = useId();
  const validatedAction = useMemo(
    () => withClientValidation(parsePasswordFormData, updatePasswordAction),
    [],
  );
  const [state, formAction, pending] = useActionState(
    validatedAction,
    initial,
  );

  function errorId(name: string) {
    return `${formId}-${name}-error`;
  }

  return (
    <form action={formAction} className="max-w-lg space-y-4" noValidate>
      <FormAlert>{state.error}</FormAlert>
      <FormSuccess>{state.success}</FormSuccess>

      <div>
        <label
          htmlFor={`${formId}-currentPassword`}
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          Current password
        </label>
        <input
          id={`${formId}-currentPassword`}
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={Boolean(state.fieldErrors?.currentPassword)}
          aria-describedby={
            state.fieldErrors?.currentPassword
              ? errorId("currentPassword")
              : undefined
          }
          className={controlClassName("w-full")}
        />
        <FieldError
          id={errorId("currentPassword")}
          messages={state.fieldErrors?.currentPassword}
        />
      </div>

      <div>
        <label
          htmlFor={`${formId}-newPassword`}
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          New password
        </label>
        <input
          id={`${formId}-newPassword`}
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          aria-invalid={Boolean(state.fieldErrors?.newPassword)}
          aria-describedby={
            state.fieldErrors?.newPassword ? errorId("newPassword") : undefined
          }
          className={controlClassName("w-full")}
        />
        <FieldError
          id={errorId("newPassword")}
          messages={state.fieldErrors?.newPassword}
        />
      </div>

      <div>
        <label
          htmlFor={`${formId}-confirmPassword`}
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          Confirm new password
        </label>
        <input
          id={`${formId}-confirmPassword`}
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          aria-invalid={Boolean(state.fieldErrors?.confirmPassword)}
          aria-describedby={
            state.fieldErrors?.confirmPassword
              ? errorId("confirmPassword")
              : undefined
          }
          className={controlClassName("w-full")}
        />
        <FieldError
          id={errorId("confirmPassword")}
          messages={state.fieldErrors?.confirmPassword}
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}
