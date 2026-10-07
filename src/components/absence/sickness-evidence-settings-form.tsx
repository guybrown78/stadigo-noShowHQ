"use client";

import { useActionState, useId, useMemo, useState } from "react";
import {
  updateSicknessEvidenceSettingsAction,
  type SicknessEvidenceSettingsActionState,
} from "@/app/(app)/settings/actions";
import { FieldError, FormAlert, controlClassName } from "@/components/form";
import { withClientValidation } from "@/lib/form";
import { parseSicknessEvidenceSettingsFormData } from "@/lib/absence/evidence-settings-schema";
import {
  EVIDENCE_CHASE_AFTER_HELP,
  EVIDENCE_REQUIRED_FROM_HELP,
  EVIDENCE_SETTINGS_PROSPECTIVE,
} from "@/lib/absence/evidence-policy";

const initialState: SicknessEvidenceSettingsActionState = {};

export function SicknessEvidenceSettingsForm({
  requiredFromDay,
  chaseAfterDays,
}: {
  requiredFromDay: number;
  chaseAfterDays: number;
}) {
  const formId = useId();
  const action = useMemo(
    () =>
      withClientValidation(
        parseSicknessEvidenceSettingsFormData,
        updateSicknessEvidenceSettingsAction,
      ),
    [],
  );
  const [state, formAction, pending] = useActionState(action, initialState);
  const [requiredValue, setRequiredValue] = useState(String(requiredFromDay));
  const [chaseValue, setChaseValue] = useState(String(chaseAfterDays));

  return (
    <form action={formAction} noValidate className="mt-6 max-w-xl space-y-4">
      <FormAlert>{state.error}</FormAlert>
      <div>
        <label
          htmlFor={`${formId}-required`}
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          Fit note required from sickness day{" "}
          <span className="text-red-700">*</span>
        </label>
        <input
          id={`${formId}-required`}
          name="fitNoteRequiredFromDay"
          type="text"
          inputMode="numeric"
          value={requiredValue}
          onChange={(event) => setRequiredValue(event.target.value)}
          aria-invalid={Boolean(state.fieldErrors?.fitNoteRequiredFromDay)}
          aria-describedby={
            state.fieldErrors?.fitNoteRequiredFromDay
              ? `${formId}-required-error`
              : `${formId}-required-help`
          }
          className={controlClassName("w-full")}
        />
        <p id={`${formId}-required-help`} className="mt-2 text-sm text-slate-600">
          {EVIDENCE_REQUIRED_FROM_HELP}
        </p>
        <FieldError
          id={`${formId}-required-error`}
          messages={state.fieldErrors?.fitNoteRequiredFromDay}
        />
      </div>
      <div>
        <label
          htmlFor={`${formId}-chase`}
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          Chase after request, in calendar days{" "}
          <span className="text-red-700">*</span>
        </label>
        <input
          id={`${formId}-chase`}
          name="fitNoteChaseAfterDays"
          type="text"
          inputMode="numeric"
          value={chaseValue}
          onChange={(event) => setChaseValue(event.target.value)}
          aria-invalid={Boolean(state.fieldErrors?.fitNoteChaseAfterDays)}
          aria-describedby={
            state.fieldErrors?.fitNoteChaseAfterDays
              ? `${formId}-chase-error`
              : `${formId}-chase-help`
          }
          className={controlClassName("w-full")}
        />
        <p id={`${formId}-chase-help`} className="mt-2 text-sm text-slate-600">
          {EVIDENCE_CHASE_AFTER_HELP}
        </p>
        <FieldError
          id={`${formId}-chase-error`}
          messages={state.fieldErrors?.fitNoteChaseAfterDays}
        />
      </div>
      <p className="text-sm text-slate-600">{EVIDENCE_SETTINGS_PROSPECTIVE}</p>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
