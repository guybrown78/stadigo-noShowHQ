"use client";

import { useActionState } from "react";
import {
  confirmImportEventsAction,
  type ImportActionState,
} from "@/app/(app)/events/import/actions";
import { PendingSubmit } from "@/components/events/pending-submit";
import { FormAlert } from "@/components/form";

export function ConfirmEventsForm({
  importId,
  eventCount,
}: {
  importId: string;
  eventCount: number;
}) {
  const [state, action] = useActionState(
    confirmImportEventsAction,
    {} as ImportActionState,
  );

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="importId" value={importId} />
      <FormAlert>{state.error}</FormAlert>
      <PendingSubmit
        pendingLabel="Creating events…"
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        Create {eventCount} {eventCount === 1 ? "event" : "events"}
      </PendingSubmit>
      <p className="text-xs text-slate-500">
        This creates new events only. It does not update existing events, create
        staff bookings, or calculate staffing risk.
      </p>
    </form>
  );
}
