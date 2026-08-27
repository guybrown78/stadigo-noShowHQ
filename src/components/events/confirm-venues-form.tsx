"use client";

import { useActionState } from "react";
import {
  confirmImportVenuesAction,
  type ImportActionState,
} from "@/app/(app)/events/import/actions";
import { PendingSubmit } from "@/components/events/pending-submit";

export function ConfirmVenuesForm({
  importId,
  newVenueCount,
  eventCount,
}: {
  importId: string;
  newVenueCount: number;
  eventCount: number;
}) {
  const [state, action] = useActionState(
    confirmImportVenuesAction,
    {} as ImportActionState,
  );

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="importId" value={importId} />
      {state.error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {state.error}
        </p>
      ) : null}
      <PendingSubmit
        pendingLabel={
          newVenueCount > 0 ? "Creating venues…" : "Saving venue confirmation…"
        }
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {newVenueCount > 0
          ? `Confirm and create ${newVenueCount} ${newVenueCount === 1 ? "venue" : "venues"}`
          : `Confirm ${eventCount} ${eventCount === 1 ? "event" : "events"} will use these venues`}
      </PendingSubmit>
      <p className="text-xs text-slate-500">
        This does not create events. Events are created only after the final
        confirmation.
      </p>
    </form>
  );
}
