"use client";

import { useEffect, useId, useRef, useState } from "react";
import { deleteStaffAction } from "@/app/(app)/staff/actions";

export function DeleteStaffDialog({
  staffId,
  staffName,
  staffIdNumber,
}: {
  staffId: string;
  staffName: string;
  staffIdNumber: string;
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
        Delete staff member
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
            Delete {staffName} ({staffIdNumber})?
          </h2>
          <p id={descriptionId} className="mt-2 text-sm text-slate-600">
            This removes {staffName} from the active staff directory. They will
            no longer appear in search or be available for new links. Historical
            records that already refer to this person are kept.
          </p>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
            <form action={deleteStaffAction}>
              <input type="hidden" name="staffId" value={staffId} />
              <button
                type="submit"
                className="rounded-md bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800"
              >
                Delete staff member
              </button>
            </form>
          </div>
        </div>
      </dialog>
    </>
  );
}
