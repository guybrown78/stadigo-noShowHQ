"use client";

import { useActionState, useId, useMemo } from "react";
import {
  updateProfileAction,
  type ProfileActionState,
} from "@/app/profile/actions";
import {
  FieldError,
  FormAlert,
  FormSuccess,
  controlClassName,
} from "@/components/form";
import { parseProfileFormData } from "@/lib/account/schema";
import { withClientValidation } from "@/lib/form";

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
  const formId = useId();
  const validatedAction = useMemo(
    () => withClientValidation(parseProfileFormData, updateProfileAction),
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
          htmlFor={`${formId}-email`}
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          Email
        </label>
        <input
          id={`${formId}-email`}
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
          htmlFor={`${formId}-firstName`}
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          First name
        </label>
        <input
          id={`${formId}-firstName`}
          name="firstName"
          type="text"
          required
          defaultValue={firstName}
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
          type="text"
          required
          defaultValue={lastName}
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
