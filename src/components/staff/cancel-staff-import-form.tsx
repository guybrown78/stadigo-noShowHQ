"use client";

import { cancelImportAction } from "@/app/(app)/staff/import/actions";
import { PendingSubmit } from "@/components/events/pending-submit";

export function CancelStaffImportForm({ importId }: { importId: string }) {
  return (
    <form action={cancelImportAction}>
      <input type="hidden" name="importId" value={importId} />
      <PendingSubmit
        pendingLabel="Cancelling…"
        className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-wash disabled:opacity-60"
      >
        Cancel import
      </PendingSubmit>
    </form>
  );
}
