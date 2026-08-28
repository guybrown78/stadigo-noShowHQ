"use client";

import { useActionState, useId, useMemo } from "react";
import {
  amendProbationEndAction,
  type ProbationActionState,
} from "@/app/(app)/staff/actions";
import { FieldError, FormAlert, controlClassName } from "@/components/form";
import { withClientValidation } from "@/lib/form";
import { parseAmendProbationEndFormData } from "@/lib/staff/review-schema";

const initialState: ProbationActionState = {};

export function AmendProbationEndForm({
  staffId,
  currentEndIso,
}: {
  staffId: string;
  currentEndIso: string;
}) {
  const formId = useId();
  const action = useMemo(
    () =>
      withClientValidation(parseAmendProbationEndFormData, amendProbationEndAction),
    [],
  );
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} noValidate className="mt-6 space-y-4">
      <input type="hidden" name="staffId" value={staffId} />
      <FormAlert>{state.error}</FormAlert>
      <div>
        <label
          htmlFor={`${formId}-end`}
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          New probation end date <span className="text-red-700">*</span>
        </label>
        <input
          id={`${formId}-end`}
          name="newEndDate"
          type="date"
          required
          aria-invalid={Boolean(state.fieldErrors?.newEndDate)}
          className={controlClassName("w-full max-w-xs")}
        />
        <p className="mt-1 text-xs text-slate-500">
          Current end date is {currentEndIso}. This is not a final Pass /
          Extend / Not continued decision.
        </p>
        <FieldError
          id={`${formId}-end-error`}
          messages={state.fieldErrors?.newEndDate}
        />
      </div>
      <div>
        <label
          htmlFor={`${formId}-reason`}
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          Reason <span className="text-red-700">*</span>
        </label>
        <textarea
          id={`${formId}-reason`}
          name="reason"
          rows={4}
          maxLength={2000}
          required
          aria-invalid={Boolean(state.fieldErrors?.reason)}
          className={controlClassName("w-full")}
        />
        <FieldError
          id={`${formId}-reason-error`}
          messages={state.fieldErrors?.reason}
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save end date"}
      </button>
    </form>
  );
}
