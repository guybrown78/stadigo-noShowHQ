"use client";

import { useActionState } from "react";
import {
  resetTenantAdminPasswordAction,
  type ResetPasswordActionState,
} from "@/app/(platform)/admin/actions";

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
  const [state, formAction, pending] = useActionState(
    resetTenantAdminPasswordAction,
    initial,
  );

  return (
    <form action={formAction} className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-4">
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="userId" value={userId} />
      <p className="text-sm font-medium text-slate-900">
        Reset password for {userLabel}
      </p>

      {state.error ? (
        <p
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
        >
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p
          className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
          role="status"
        >
          {state.success}
        </p>
      ) : null}

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
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none ring-slate-400 focus:ring-2"
          />
          {state.fieldErrors?.newPassword ? (
            <p className="mt-1 text-sm text-red-700">
              {state.fieldErrors.newPassword[0]}
            </p>
          ) : null}
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
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none ring-slate-400 focus:ring-2"
          />
          {state.fieldErrors?.confirmPassword ? (
            <p className="mt-1 text-sm text-red-700">
              {state.fieldErrors.confirmPassword[0]}
            </p>
          ) : null}
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
