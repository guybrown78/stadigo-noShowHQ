"use client";

import { useActionState } from "react";
import {
  updateProfileAction,
  type ProfileActionState,
} from "@/app/profile/actions";

const initial: ProfileActionState = {};

export function ProfileForm({
  email,
  firstName,
  lastName,
}: {
  email: string;
  firstName: string;
  lastName: string;
}) {
  const [state, formAction, pending] = useActionState(
    updateProfileAction,
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
          htmlFor="email"
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          readOnly
          className="w-full cursor-not-allowed rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600"
        />
        <p className="mt-1 text-xs text-slate-500">
          Email cannot be changed yet.
        </p>
      </div>

      <div>
        <label
          htmlFor="firstName"
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          First name
        </label>
        <input
          id="firstName"
          name="firstName"
          type="text"
          required
          defaultValue={firstName}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none ring-slate-400 focus:ring-2"
        />
        {state.fieldErrors?.firstName ? (
          <p className="mt-1 text-sm text-red-700">
            {state.fieldErrors.firstName[0]}
          </p>
        ) : null}
      </div>

      <div>
        <label
          htmlFor="lastName"
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          Last name
        </label>
        <input
          id="lastName"
          name="lastName"
          type="text"
          required
          defaultValue={lastName}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none ring-slate-400 focus:ring-2"
        />
        {state.fieldErrors?.lastName ? (
          <p className="mt-1 text-sm text-red-700">
            {state.fieldErrors.lastName[0]}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
