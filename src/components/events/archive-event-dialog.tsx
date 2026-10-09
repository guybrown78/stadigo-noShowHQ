"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  archiveEventAction,
  unarchiveEventAction,
} from "@/app/(app)/events/actions";

export function ArchiveEventDialog({
  eventId,
  eventName,
  archived,
  open: openProp,
  onOpenChange,
  showTrigger = true,
}: {
  eventId: string;
  eventName: string;
  archived: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = openProp ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  const titleId = useId();
  const descriptionId = useId();
  const actionLabel = archived ? "Restore event" : "Archive event";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <>
      {showTrigger ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
        >
          {actionLabel}
        </button>
      ) : null}
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-[min(100%,28rem)] rounded-lg border border-slate-200 p-0 shadow-xl backdrop:bg-slate-900/40"
        onClose={() => setOpen(false)}
      >
        <div className="p-5">
          <h2 id={titleId} className="text-lg font-semibold text-slate-900">
            {archived ? `Restore ${eventName}?` : `Archive ${eventName}?`}
          </h2>
          <p id={descriptionId} className="mt-2 text-sm text-slate-600">
            {archived
              ? "This puts the event back on the upcoming, past, and all-dates lists."
              : "This takes the event off the upcoming, past, and all-dates lists. You can still open it from Archived, and you can restore it later."}
          </p>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
            <form action={archived ? unarchiveEventAction : archiveEventAction}>
              <input type="hidden" name="eventId" value={eventId} />
              <button
                type="submit"
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-hover"
              >
                {actionLabel}
              </button>
            </form>
          </div>
        </div>
      </dialog>
    </>
  );
}
