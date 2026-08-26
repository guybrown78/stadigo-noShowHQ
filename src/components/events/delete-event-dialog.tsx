"use client";

import { useEffect, useId, useRef, useState } from "react";
import { deleteEventAction } from "@/app/(app)/events/actions";

export function DeleteEventDialog({
  eventId,
  eventName,
}: {
  eventId: string;
  eventName: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const descriptionId = useId();

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
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-50"
      >
        Delete event
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-[min(100%,28rem)] rounded-lg border border-slate-200 p-0 shadow-xl backdrop:bg-slate-900/40"
        onClose={() => setOpen(false)}
      >
        <div className="p-5">
          <h2 id={titleId} className="text-lg font-semibold text-slate-900">
            Delete {eventName}?
          </h2>
          <p id={descriptionId} className="mt-2 text-sm text-slate-600">
            This will remove the event from the active Events list. It will no
            longer appear in search or be available to edit.
          </p>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
            <form action={deleteEventAction}>
              <input type="hidden" name="eventId" value={eventId} />
              <button
                type="submit"
                className="rounded-md bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800"
              >
                Delete event
              </button>
            </form>
          </div>
        </div>
      </dialog>
    </>
  );
}
