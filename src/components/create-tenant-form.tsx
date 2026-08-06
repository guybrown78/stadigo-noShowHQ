"use client";

import { useActionState } from "react";
import {
  createTenantAction,
  type TenantActionState,
} from "@/app/(platform)/admin/actions";

const initial: TenantActionState = {};

export function CreateTenantForm() {
  const [state, formAction, pending] = useActionState(
    createTenantAction,
    initial,
  );

  return (
    <form action={formAction} className="max-w-xl space-y-4">
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

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-slate-900">
          Organisation
        </legend>
        <div>
          <label
            htmlFor="name"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Name
          </label>
          <input
            id="name"
            name="name"
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none ring-slate-400 focus:ring-2"
          />
          {state.fieldErrors?.name ? (
            <p className="mt-1 text-sm text-red-700">
              {state.fieldErrors.name[0]}
            </p>
          ) : null}
        </div>
        <div>
          <label
            htmlFor="slug"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Slug
          </label>
          <input
            id="slug"
            name="slug"
            required
            placeholder="acme-events"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none ring-slate-400 focus:ring-2"
          />
          {state.fieldErrors?.slug ? (
            <p className="mt-1 text-sm text-red-700">
              {state.fieldErrors.slug[0]}
            </p>
          ) : null}
        </div>
      </fieldset>

      <fieldset className="space-y-4 border-t border-slate-200 pt-4">
        <legend className="text-sm font-semibold text-slate-900">
          Initial admin user
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="adminFirstName"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              First name
            </label>
            <input
              id="adminFirstName"
              name="adminFirstName"
              required
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none ring-slate-400 focus:ring-2"
            />
          </div>
          <div>
            <label
              htmlFor="adminLastName"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Last name
            </label>
            <input
              id="adminLastName"
              name="adminLastName"
              required
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none ring-slate-400 focus:ring-2"
            />
          </div>
        </div>
        <div>
          <label
            htmlFor="adminEmail"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Email
          </label>
          <input
            id="adminEmail"
            name="adminEmail"
            type="email"
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none ring-slate-400 focus:ring-2"
          />
          {state.fieldErrors?.adminEmail ? (
            <p className="mt-1 text-sm text-red-700">
              {state.fieldErrors.adminEmail[0]}
            </p>
          ) : null}
        </div>
        <div>
          <label
            htmlFor="adminPassword"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Temporary password
          </label>
          <input
            id="adminPassword"
            name="adminPassword"
            type="password"
            required
            minLength={8}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none ring-slate-400 focus:ring-2"
          />
          {state.fieldErrors?.adminPassword ? (
            <p className="mt-1 text-sm text-red-700">
              {state.fieldErrors.adminPassword[0]}
            </p>
          ) : null}
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create tenant"}
      </button>
    </form>
  );
}
