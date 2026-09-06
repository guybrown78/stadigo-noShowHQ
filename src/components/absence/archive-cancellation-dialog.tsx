"use client";

import { useActionState, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  archiveCancellationAction,
  type AbsenceActionState,
} from "@/app/(app)/absence/actions";
import { FieldError, FormAlert, controlClassName } from "@/components/form";
import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/field";
import { withClientValidation } from "@/lib/form";
import { parseArchiveCancellationFormData } from "@/lib/absence/schema";

const initialState: AbsenceActionState = {};

export function ArchiveCancellationDialog({
  absenceId,
  staffName,
  eventName,
}: {
  absenceId: string;
  staffName: string;
  eventName: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const formId = useId();
  const action = useMemo(
    () =>
      withClientValidation(
        parseArchiveCancellationFormData,
        archiveCancellationAction,
      ),
    [],
  );
  const [state, formAction, pending] = useActionState(action, initialState);

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
      <Button type="button" variant="danger" size="sm" onClick={() => setOpen(true)}>
        Archive cancellation
      </Button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-[min(100%,32rem)] rounded-lg border border-slate-200 p-0 shadow-xl backdrop:bg-slate-900/40"
        onClose={() => setOpen(false)}
      >
        <div className="p-5">
          <h2 id={titleId} className="text-lg font-semibold text-slate-900">
            Archive cancellation for {staffName} at {eventName}?
          </h2>
          <p id={descriptionId} className="mt-2 text-sm text-slate-600">
            This record will disappear from active operational views, including
            staff Absence History and the Cancellation Ledger. The data
            remains available for audit.
          </p>
          <form action={formAction} noValidate className="mt-4 space-y-3">
            <input type="hidden" name="absenceId" value={absenceId} />
            <FormAlert>{state.error}</FormAlert>
            <div>
              <FieldLabel htmlFor={`${formId}-reason`} required>
                Archive reason
              </FieldLabel>
              <textarea
                id={`${formId}-reason`}
                name="archiveReason"
                rows={3}
                maxLength={500}
                aria-invalid={Boolean(state.fieldErrors?.archiveReason)}
                className={controlClassName("w-full")}
              />
              <FieldError
                id={`${formId}-reason-error`}
                messages={state.fieldErrors?.archiveReason}
              />
            </div>
            <label className="flex items-start gap-2 text-sm text-slate-800">
              <input type="checkbox" name="confirmArchive" className="mt-1" />
              <span>
                I understand this will archive the cancellation for {staffName}{" "}
                at {eventName}.
              </span>
            </label>
            <FieldError
              id={`${formId}-confirm-error`}
              messages={state.fieldErrors?.confirmArchive}
            />
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={pending}
                size="sm"
                className="border-red-700 bg-red-700 text-white hover:bg-red-800"
              >
                {pending ? "Archiving…" : "Archive cancellation"}
              </Button>
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}
