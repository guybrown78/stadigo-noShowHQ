"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import {
  restartStaffProbationAction,
  type ProbationActionState,
} from "@/app/(app)/staff/actions";
import { FormAlert } from "@/components/form";

const initialState: ProbationActionState = {};

export function RestartProbationDialog({
  staffId,
  staffName,
  defaultDays,
  startDateLabel,
  endDateLabel,
  reviewDueLabel,
}: {
  staffId: string;
  staffName: string;
  defaultDays: number;
  startDateLabel: string;
  endDateLabel: string;
  reviewDueLabel: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const [state, formAction, pending] = useActionState(
    restartStaffProbationAction,
    initialState,
  );

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
        className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-wash"
      >
        Start probation again
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-[min(100%,28rem)] rounded-lg border border-border p-0 shadow-xl backdrop:bg-slate-900/40"
        onClose={() => setOpen(false)}
      >
        <div className="p-5">
          <h2 id={titleId} className="text-lg font-semibold text-foreground">
            Put {staffName} back on probation?
          </h2>
          <p id={descriptionId} className="mt-2 text-sm text-muted">
            This starts a new probation period from today. They will show as on
            probation again (Upcoming until the review window). The previous
            Passed or Not continued decision stays in history and is not undone.
          </p>
          <p className="mt-3 text-sm text-foreground">
            The new period uses the organisation default of{" "}
            <span className="font-medium">{defaultDays} days</span>, starting{" "}
            {startDateLabel}. End date {endDateLabel}; review due{" "}
            {reviewDueLabel}.
          </p>
          <div className="mt-3">
            <FormAlert>{state.error}</FormAlert>
          </div>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-wash"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
            <form action={formAction}>
              <input type="hidden" name="staffId" value={staffId} />
              <button
                type="submit"
                disabled={pending}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"
              >
                {pending ? "Starting…" : "Start probation again"}
              </button>
            </form>
          </div>
        </div>
      </dialog>
    </>
  );
}
