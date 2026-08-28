"use client";

import { useActionState, useId, useMemo, useState } from "react";
import {
  reviewProbationAction,
  type ProbationActionState,
} from "@/app/(app)/staff/actions";
import { FieldError, FormAlert, controlClassName } from "@/components/form";
import { withClientValidation } from "@/lib/form";
import {
  calculatedReviewDueDate,
} from "@/lib/staff/probation";
import { REVIEW_OUTCOME_LABELS } from "@/lib/staff/display";
import { parseReviewProbationFormData } from "@/lib/staff/review-schema";
import { formatLocalDateDisplay, parseLocalDate } from "@/lib/events/dates";

const initialState: ProbationActionState = {};

export function ReviewProbationForm({
  staffId,
  todayIso,
  currentEndIso,
}: {
  staffId: string;
  todayIso: string;
  currentEndIso: string;
}) {
  const formId = useId();
  const action = useMemo(
    () => withClientValidation(parseReviewProbationFormData, reviewProbationAction),
    [],
  );
  const [state, formAction, pending] = useActionState(action, initialState);
  const [outcome, setOutcome] = useState<"PASSED" | "EXTENDED" | "NOT_CONTINUED" | "">(
    "",
  );
  const [newEndDate, setNewEndDate] = useState("");
  const nextReview = newEndDate
    ? parseLocalDate(newEndDate)
    : null;
  const newReviewDue = nextReview ? calculatedReviewDueDate(nextReview) : null;

  return (
    <form action={formAction} noValidate className="mt-6 space-y-4">
      <input type="hidden" name="staffId" value={staffId} />
      <FormAlert>{state.error}</FormAlert>
      <div>
        <label
          htmlFor={`${formId}-review-date`}
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          Review date <span className="text-red-700">*</span>
        </label>
        <input
          id={`${formId}-review-date`}
          name="reviewDate"
          type="date"
          defaultValue={todayIso}
          required
          aria-invalid={Boolean(state.fieldErrors?.reviewDate)}
          className={controlClassName("w-full max-w-xs")}
        />
        <FieldError
          id={`${formId}-review-date-error`}
          messages={state.fieldErrors?.reviewDate}
        />
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-slate-700">
          Outcome <span className="text-red-700">*</span>
        </legend>
        <div className="space-y-2">
          {(["PASSED", "EXTENDED", "NOT_CONTINUED"] as const).map((value) => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="outcome"
                value={value}
                checked={outcome === value}
                onChange={() => setOutcome(value)}
                required
              />
              {REVIEW_OUTCOME_LABELS[value]}
            </label>
          ))}
        </div>
        <FieldError
          id={`${formId}-outcome-error`}
          messages={state.fieldErrors?.outcome}
        />
      </fieldset>
      {outcome === "EXTENDED" ? (
        <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50 p-4">
          <div>
            <label
              htmlFor={`${formId}-new-end`}
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              New probation end date <span className="text-red-700">*</span>
            </label>
            <input
              id={`${formId}-new-end`}
              name="newEndDate"
              type="date"
              min={currentEndIso}
              value={newEndDate}
              onChange={(event) => setNewEndDate(event.target.value)}
              aria-invalid={Boolean(state.fieldErrors?.newEndDate)}
              className={controlClassName("w-full max-w-xs bg-white")}
            />
            <p className="mt-1 text-xs text-slate-600">
              Must be after the current end date ({currentEndIso}).
            </p>
            <FieldError
              id={`${formId}-new-end-error`}
              messages={state.fieldErrors?.newEndDate}
            />
          </div>
          <p className="text-sm text-slate-700">
            New review due date:{" "}
            {newReviewDue ? formatLocalDateDisplay(newReviewDue) : "Select an end date"}
          </p>
        </div>
      ) : null}
      {outcome === "NOT_CONTINUED" ? (
        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          This records the probation decision only. It does not automatically
          deactivate the staff member, change access, or send communication.
        </p>
      ) : null}
      <div>
        <label
          htmlFor={`${formId}-notes`}
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          Decision notes
          {outcome === "EXTENDED" || outcome === "NOT_CONTINUED" ? (
            <span className="text-red-700"> *</span>
          ) : (
            <span className="font-normal text-slate-500"> (optional for Passed)</span>
          )}
        </label>
        <textarea
          id={`${formId}-notes`}
          name="notes"
          rows={4}
          maxLength={2000}
          aria-invalid={Boolean(state.fieldErrors?.notes)}
          className={controlClassName("w-full")}
        />
        <FieldError
          id={`${formId}-notes-error`}
          messages={state.fieldErrors?.notes}
        />
      </div>
      <button
        type="submit"
        disabled={pending || !outcome}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Record decision"}
      </button>
    </form>
  );
}
