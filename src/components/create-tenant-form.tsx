"use client";

import { useActionState, useId, useMemo } from "react";
import {
  createTenantAction,
  type TenantActionState,
} from "@/app/(platform)/admin/actions";
import { FieldError, FormAlert, controlClassName } from "@/components/form";
import { withClientValidation } from "@/lib/form";
import { parseCreateTenantFormData } from "@/lib/tenants/schema";

const initial: TenantActionState = {};

export function CreateTenantForm() {
  const formId = useId();
  const validatedAction = useMemo(
    () => withClientValidation(parseCreateTenantFormData, createTenantAction),
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
    <form action={formAction} className="max-w-xl space-y-4" noValidate>
      <FormAlert>{state.error}</FormAlert>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-slate-900">
          Organisation
        </legend>
        <div>
          <label
            htmlFor={`${formId}-name`}
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Name
          </label>
          <input
            id={`${formId}-name`}
            name="name"
            required
            aria-invalid={Boolean(state.fieldErrors?.name)}
            aria-describedby={
              state.fieldErrors?.name ? errorId("name") : undefined
            }
            className={controlClassName("w-full")}
          />
          <FieldError id={errorId("name")} messages={state.fieldErrors?.name} />
        </div>
        <div>
          <label
            htmlFor={`${formId}-slug`}
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Slug
          </label>
          <input
            id={`${formId}-slug`}
            name="slug"
            required
            placeholder="acme-events"
            aria-invalid={Boolean(state.fieldErrors?.slug)}
            aria-describedby={
              state.fieldErrors?.slug ? errorId("slug") : undefined
            }
            className={controlClassName("w-full")}
          />
          <FieldError id={errorId("slug")} messages={state.fieldErrors?.slug} />
        </div>
      </fieldset>

      <fieldset className="space-y-4 border-t border-slate-200 pt-4">
        <legend className="text-sm font-semibold text-slate-900">
          Initial admin user
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor={`${formId}-adminFirstName`}
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              First name
            </label>
            <input
              id={`${formId}-adminFirstName`}
              name="adminFirstName"
              required
              aria-invalid={Boolean(state.fieldErrors?.adminFirstName)}
              aria-describedby={
                state.fieldErrors?.adminFirstName
                  ? errorId("adminFirstName")
                  : undefined
              }
              className={controlClassName("w-full")}
            />
            <FieldError
              id={errorId("adminFirstName")}
              messages={state.fieldErrors?.adminFirstName}
            />
          </div>
          <div>
            <label
              htmlFor={`${formId}-adminLastName`}
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Last name
            </label>
            <input
              id={`${formId}-adminLastName`}
              name="adminLastName"
              required
              aria-invalid={Boolean(state.fieldErrors?.adminLastName)}
              aria-describedby={
                state.fieldErrors?.adminLastName
                  ? errorId("adminLastName")
                  : undefined
              }
              className={controlClassName("w-full")}
            />
            <FieldError
              id={errorId("adminLastName")}
              messages={state.fieldErrors?.adminLastName}
            />
          </div>
        </div>
        <div>
          <label
            htmlFor={`${formId}-adminEmail`}
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Email
          </label>
          <input
            id={`${formId}-adminEmail`}
            name="adminEmail"
            type="email"
            required
            aria-invalid={Boolean(state.fieldErrors?.adminEmail)}
            aria-describedby={
              state.fieldErrors?.adminEmail ? errorId("adminEmail") : undefined
            }
            className={controlClassName("w-full")}
          />
          <FieldError
            id={errorId("adminEmail")}
            messages={state.fieldErrors?.adminEmail}
          />
        </div>
        <div>
          <label
            htmlFor={`${formId}-adminPassword`}
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Temporary password
          </label>
          <input
            id={`${formId}-adminPassword`}
            name="adminPassword"
            type="password"
            required
            minLength={8}
            aria-invalid={Boolean(state.fieldErrors?.adminPassword)}
            aria-describedby={
              state.fieldErrors?.adminPassword
                ? errorId("adminPassword")
                : undefined
            }
            className={controlClassName("w-full")}
          />
          <FieldError
            id={errorId("adminPassword")}
            messages={state.fieldErrors?.adminPassword}
          />
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
