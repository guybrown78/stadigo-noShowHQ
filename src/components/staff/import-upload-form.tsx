"use client";

import { useActionState, useId, useMemo } from "react";
import {
  uploadImportAction,
  type ImportActionState,
} from "@/app/(app)/staff/import/actions";
import { PendingSubmit } from "@/components/events/pending-submit";
import { FieldError, FormAlert, controlClassName } from "@/components/form";
import { parseImportUploadFormData } from "@/lib/staff/import/upload";
import { withClientValidation } from "@/lib/form";

export function ImportUploadForm({
  importId,
  compact = false,
}: {
  importId?: string;
  compact?: boolean;
}) {
  const formId = useId();
  const errorId = `${formId}-file-error`;
  const validatedAction = useMemo(
    () => withClientValidation(parseImportUploadFormData, uploadImportAction),
    [],
  );
  const [state, action] = useActionState(
    validatedAction,
    {} as ImportActionState,
  );
  const fileInvalid = Boolean(state.fieldErrors?.file);

  return (
    <form action={action} className="space-y-4" noValidate>
      {importId ? (
        <input type="hidden" name="replaceImportId" value={importId} />
      ) : null}
      <div>
        <label
          htmlFor={`${formId}-file`}
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          Spreadsheet file <span className="text-red-700">*</span>
        </label>
        <input
          id={`${formId}-file`}
          name="file"
          type="file"
          required
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          aria-required="true"
          aria-invalid={fileInvalid}
          aria-describedby={
            fileInvalid
              ? `${formId}-file-help ${errorId}`
              : `${formId}-file-help`
          }
          className={controlClassName(
            "block w-full bg-white text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800",
          )}
        />
        <FieldError id={errorId} messages={state.fieldErrors?.file} />
        <p id={`${formId}-file-help`} className="mt-1 text-xs text-slate-500">
          .xlsx template or UTF-8 CSV with the same headers. Maximum 5 MB and
          5,000 staff rows.
        </p>
      </div>
      <FormAlert>{state.error}</FormAlert>
      <PendingSubmit
        pendingLabel="Checking your file…"
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {compact ? "Upload corrected file" : "Upload and check"}
      </PendingSubmit>
    </form>
  );
}
