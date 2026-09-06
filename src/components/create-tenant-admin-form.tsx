"use client";

import { useActionState, useEffect, useId, useMemo, useRef } from "react";
import {
  createTenantAdminAction,
  type CreateTenantAdminActionState,
} from "@/app/(platform)/admin/actions";
import {
  FieldError,
  FormAlert,
  FormSuccess,
  controlClassName,
} from "@/components/form";
import { withClientValidation } from "@/lib/form";
import { parseCreateTenantAdminFormData } from "@/lib/tenants/schema";

const initial: CreateTenantAdminActionState = {};

export function CreateTenantAdminForm({ tenantId }: { tenantId: string }) {
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const validatedAction = useMemo(
    () =>
      withClientValidation(
        parseCreateTenantAdminFormData,
        createTenantAdminAction,
      ),
    [],
  );
  const [state, formAction, pending] = useActionState(
    validatedAction,
    initial,
  );

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
    }
  }, [state.success]);

  function errorId(name: string) {
    return `${formId}-${name}-error`;
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-4 rounded-lg border border-slate-200 bg-white p-5"
      noValidate
    >
      <input type="hidden" name="tenantId" value={tenantId} />
      <p className="text-sm font-medium text-slate-900">Add admin</p>

      <FormAlert>{state.error}</FormAlert>
      <FormSuccess>{state.success}</FormSuccess>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor={`${formId}-firstName`}
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            First name
          </label>
          <input
            id={`${formId}-firstName`}
            name="firstName"
            required
            aria-invalid={Boolean(state.fieldErrors?.firstName)}
            aria-describedby={
              state.fieldErrors?.firstName ? errorId("firstName") : undefined
            }
            className={controlClassName("w-full")}
          />
          <FieldError
            id={errorId("firstName")}
            messages={state.fieldErrors?.firstName}
          />
        </div>
        <div>
          <label
            htmlFor={`${formId}-lastName`}
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Last name
          </label>
          <input
            id={`${formId}-lastName`}
            name="lastName"
            required
            aria-invalid={Boolean(state.fieldErrors?.lastName)}
            aria-describedby={
              state.fieldErrors?.lastName ? errorId("lastName") : undefined
            }
            className={controlClassName("w-full")}
          />
          <FieldError
            id={errorId("lastName")}
            messages={state.fieldErrors?.lastName}
          />
        </div>
      </div>
      <div>
        <label
          htmlFor={`${formId}-email`}
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          Email
        </label>
        <input
          id={`${formId}-email`}
          name="email"
          type="email"
          required
          aria-invalid={Boolean(state.fieldErrors?.email)}
          aria-describedby={
            state.fieldErrors?.email ? errorId("email") : undefined
          }
          className={controlClassName("w-full")}
        />
        <FieldError id={errorId("email")} messages={state.fieldErrors?.email} />
      </div>
      <div>
        <label
          htmlFor={`${formId}-password`}
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          Temporary password
        </label>
        <input
          id={`${formId}-password`}
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          aria-invalid={Boolean(state.fieldErrors?.password)}
          aria-describedby={
            state.fieldErrors?.password ? errorId("password") : undefined
          }
          className={controlClassName("w-full")}
        />
        <FieldError
          id={errorId("password")}
          messages={state.fieldErrors?.password}
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create admin"}
      </button>
    </form>
  );
}
