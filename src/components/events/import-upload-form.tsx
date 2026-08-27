"use client";

import { useActionState } from "react";
import {
  uploadImportAction,
  type ImportActionState,
} from "@/app/(app)/events/import/actions";
import { PendingSubmit } from "@/components/events/pending-submit";

export function ImportUploadForm({
  importId,
  compact = false,
}: {
  importId?: string;
  compact?: boolean;
}) {
  const [state, action] = useActionState(uploadImportAction, {} as ImportActionState);

  return (
    <form action={action} className="space-y-4">
      {importId ? <input type="hidden" name="replaceImportId" value={importId} /> : null}
      <div>
        <label htmlFor="import-file" className="mb-1 block text-sm font-medium text-slate-700">
          Spreadsheet file
        </label>
        <input
          id="import-file"
          name="file"
          type="file"
          required
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800"
        />
        <p className="mt-1 text-xs text-slate-500">
          .xlsx template or UTF-8 CSV with the same headers. Maximum 5 MB and 5,000 event rows.
        </p>
      </div>
      {state.error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {state.error}
        </p>
      ) : null}
      <PendingSubmit
        pendingLabel="Checking your file…"
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {compact ? "Upload corrected file" : "Upload and check"}
      </PendingSubmit>
    </form>
  );
}
