"use client";

import { useActionState } from "react";
import {
  updatePasswordAction,
  type ProfileActionState,
} from "@/app/(app)/settings/actions";

const initial: ProfileActionState = {};

export function PasswordForm() {
  const [state, formAction, pending] = useActionState(
    updatePasswordAction,
    initial,
  );

  return (
    <form action={formAction} className="max-w-lg space-y-4">
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

      <div>
        <label
          htmlFor="currentPassword"
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          Current password
        </label>
        <input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none ring-slate-400 focus:ring-2"
        />
        {state.fieldErrors?.currentPassword ? (
          <p className="mt-1 text-sm text-red-700">
            {state.fieldErrors.currentPassword[0]}
          </p>
        ) : null}
      </div>

      <div>
        <label
          htmlFor="newPassword"
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          New password
        </label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none ring-slate-400 focus:ring-2"
        />
        {state.fieldErrors?.newPassword ? (
          <p className="mt-1 text-sm text-red-700">
            {state.fieldErrors.newPassword[0]}
          </p>
        ) : null}
      </div>

      <div>
        <label
          htmlFor="confirmPassword"
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          Confirm new password
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none ring-slate-400 focus:ring-2"
        />
        {state.fieldErrors?.confirmPassword ? (
          <p className="mt-1 text-sm text-red-700">
            {state.fieldErrors.confirmPassword[0]}
          </p>
        ) : null}
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
