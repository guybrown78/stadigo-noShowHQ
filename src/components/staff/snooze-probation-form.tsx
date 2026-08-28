"use client";

import { useActionState, useId, useMemo } from "react";
import {
  snoozeProbationTaskAction,
  type ProbationActionState,
} from "@/app/(app)/staff/actions";
import { FieldError, FormAlert, controlClassName } from "@/components/form";
import { withClientValidation } from "@/lib/form";
import { parseSnoozeProbationTaskFormData } from "@/lib/staff/review-schema";

const initialState: ProbationActionState = {};

export function SnoozeProbationTaskForm({
  taskId,
  staffId,
  maxDate,
}: {
  taskId: string;
  staffId: string;
  maxDate: string;
}) {
  const formId = useId();
  const action = useMemo(
    () =>
      withClientValidation(
        parseSnoozeProbationTaskFormData,
        snoozeProbationTaskAction,
      ),
    [],
  );
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} noValidate className="space-y-3">
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="staffId" value={staffId} />
      <FormAlert>{state.error}</FormAlert>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label
            htmlFor={`${formId}-until`}
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Snooze until <span className="text-red-700">*</span>
          </label>
          <input
            id={`${formId}-until`}
            name="snoozedUntil"
            type="date"
            max={maxDate}
            required
            aria-invalid={Boolean(state.fieldErrors?.snoozedUntil)}
            className={controlClassName("w-full")}
          />
          <FieldError
            id={`${formId}-until-error`}
            messages={state.fieldErrors?.snoozedUntil}
          />
        </div>
        <div>
          <label
            htmlFor={`${formId}-reason`}
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Reason <span className="text-red-700">*</span>
          </label>
          <input
            id={`${formId}-reason`}
            name="reason"
            type="text"
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
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Snooze"}
      </button>
    </form>
  );
}
