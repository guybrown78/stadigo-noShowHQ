"use client";

import { useActionState, useId, useMemo } from "react";
import {
  updateProbationSettingsAction,
  type ProbationSettingsActionState,
} from "@/app/(app)/settings/actions";
import { FieldError, FormAlert, controlClassName } from "@/components/form";
import { withClientValidation } from "@/lib/form";
import { parseTenantProbationSettingsFormData } from "@/lib/staff/review-schema";

const initialState: ProbationSettingsActionState = {};

export function ProbationSettingsForm({
  defaultProbationDays,
}: {
  defaultProbationDays: number;
}) {
  const formId = useId();
  const action = useMemo(
    () =>
      withClientValidation(
        parseTenantProbationSettingsFormData,
        updateProbationSettingsAction,
      ),
    [],
  );
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} noValidate className="mt-6 max-w-md space-y-4">
      <FormAlert>{state.error}</FormAlert>
      <div>
        <label
          htmlFor={`${formId}-days`}
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          Default probation length (days){" "}
          <span className="text-red-700">*</span>
        </label>
        <input
          id={`${formId}-days`}
          name="defaultProbationDays"
          type="number"
          inputMode="numeric"
          min={1}
          max={730}
          defaultValue={defaultProbationDays}
          required
          aria-invalid={Boolean(state.fieldErrors?.defaultProbationDays)}
          aria-describedby={
            state.fieldErrors?.defaultProbationDays
              ? `${formId}-days-error`
              : `${formId}-help`
          }
          className={controlClassName("w-full")}
        />
        <p id={`${formId}-help`} className="mt-2 text-sm text-slate-600">
          This default is used for staff added after you save this change. It
          will not alter existing probation dates.
        </p>
        <FieldError
          id={`${formId}-days-error`}
          messages={state.fieldErrors?.defaultProbationDays}
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save probation default"}
      </button>
    </form>
  );
}
