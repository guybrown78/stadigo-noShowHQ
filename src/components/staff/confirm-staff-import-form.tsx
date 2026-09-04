"use client";

import { useActionState } from "react";
import {
  confirmImportAction,
  type ImportActionState,
} from "@/app/(app)/staff/import/actions";
import { PendingSubmit } from "@/components/events/pending-submit";
import { FormAlert } from "@/components/form";

export function ConfirmStaffImportForm({
  importId,
  staffCount,
}: {
  importId: string;
  staffCount: number;
}) {
  const [state, action] = useActionState(
    confirmImportAction,
    {} as ImportActionState,
  );

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="importId" value={importId} />
      <FormAlert>{state.error}</FormAlert>
      <PendingSubmit
        pendingLabel="Creating staff…"
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        Create {staffCount} {staffCount === 1 ? "staff member" : "staff members"}
      </PendingSubmit>
      <p className="text-xs text-slate-500">
        This creates new operational staff records only. It does not update
        existing staff, create user accounts, or send communications.
      </p>
    </form>
  );
}
