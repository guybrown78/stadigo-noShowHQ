"use client";

import { useActionState, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  saveReturnToWorkAction,
  type ReturnToWorkActionState,
} from "@/app/(app)/absence/return-to-work-actions";
import { FieldError, FormAlert, controlClassName } from "@/components/form";
import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/field";
import {
  RETURN_TO_WORK_STATUSES,
  type ReturnToWorkStatus,
} from "@/lib/absence/catalog";
import {
  RETURN_TO_WORK_CLEAR_DATE_MESSAGE,
  RETURN_TO_WORK_NOTE_HELPER,
  RETURN_TO_WORK_SECTION_DESCRIPTION,
  RETURN_TO_WORK_STATUS_LABELS,
  returnToWorkDateApplies,
} from "@/lib/absence/return-to-work";
import { parseSaveReturnToWorkFormData } from "@/lib/absence/return-to-work-schema";
import { withClientValidation } from "@/lib/form";
import { parseLocalDate } from "@/lib/events/dates";

const initialState: ReturnToWorkActionState = {};

function useReturnToWorkDialog(
  dialogRef: React.RefObject<HTMLDialogElement | null>,
) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const formId = useId();
  const [idempotencyKey, setIdempotencyKey] = useState("");

  function openDialog() {
    setIdempotencyKey((current) => current || crypto.randomUUID());
    setOpen(true);
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [dialogRef, open]);

  return { setOpen, openDialog, titleId, descriptionId, formId, idempotencyKey };
}

function usePreserveInvalidInput(
  formRef: React.RefObject<HTMLFormElement | null>,
  fieldErrors: ReturnToWorkActionState["fieldErrors"],
) {
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const preventActionReset = (event: Event) => {
      event.preventDefault();
    };
    form.addEventListener("reset", preventActionReset);
    return () => form.removeEventListener("reset", preventActionReset);
  }, [formRef]);

  useEffect(() => {
    if (!fieldErrors) return;
    const firstInvalid = formRef.current?.querySelector<HTMLElement>(
      "[aria-invalid='true']",
    );
    firstInvalid?.focus();
  }, [fieldErrors, formRef]);
}

export function ReturnToWorkDialog({
  absenceId,
  status,
  completedOn,
  note,
  expectedUpdatedAt,
  todayIso,
  returnTo,
}: {
  absenceId: string;
  status: ReturnToWorkStatus;
  completedOn: string;
  note: string;
  expectedUpdatedAt: string | null;
  todayIso?: string;
  returnTo?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const dialog = useReturnToWorkDialog(dialogRef);
  const correcting = Boolean(expectedUpdatedAt);
  const parse = useMemo(
    () => (formData: FormData) =>
      parseSaveReturnToWorkFormData(formData, todayIso),
    [todayIso],
  );
  const action = useMemo(
    () => withClientValidation(parse, saveReturnToWorkAction),
    [parse],
  );
  const [state, formAction, pending] = useActionState(action, initialState);
  const [nextStatus, setNextStatus] = useState(status);
  const [nextNote, setNextNote] = useState(note);
  const [reason, setReason] = useState("");
  const savedKey = `${absenceId}|${expectedUpdatedAt ?? ""}|${status}|${completedOn}|${note}`;
  const [seenSavedKey, setSeenSavedKey] = useState(savedKey);
  const dateValueRef = useRef(completedOn);
  const submittedDateRef = useRef<string | null>(null);
  const ignoreDateClear = useRef(false);
  if (seenSavedKey !== savedKey) {
    setSeenSavedKey(savedKey);
    setNextStatus(status);
    setNextNote(note);
    setReason("");
  }
  useEffect(() => {
    dateValueRef.current = completedOn;
    submittedDateRef.current = null;
  }, [savedKey, completedOn]);
  usePreserveInvalidInput(formRef, state.fieldErrors);

  function dateInput(form: HTMLFormElement): HTMLInputElement | null {
    const field = form.elements.namedItem("completedOn");
    return field instanceof HTMLInputElement ? field : null;
  }

  function rememberDate(value: string) {
    if (value === "" || parseLocalDate(value)) {
      dateValueRef.current = value;
    }
  }

  function preserveEnteredValues(event: {
    preventDefault(): void;
    currentTarget: EventTarget | null;
  }) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!(form instanceof HTMLFormElement)) return;
    const date = dateInput(form);
    if (!date) return;
    ignoreDateClear.current = true;
    if (parseLocalDate(date.value)) {
      rememberDate(date.value);
      if (submittedDateRef.current !== null) {
        submittedDateRef.current = date.value;
      }
    }
    const keep =
      submittedDateRef.current !== null
        ? submittedDateRef.current
        : dateValueRef.current;
    queueMicrotask(() => {
      ignoreDateClear.current = false;
      submittedDateRef.current = null;
      if (!date.isConnected) return;
      if ((keep === "" || parseLocalDate(keep)) && date.value !== keep) {
        date.value = keep;
      }
    });
  }
  const preserveEnteredValuesRef = useRef(preserveEnteredValues);
  useEffect(() => {
    preserveEnteredValuesRef.current = preserveEnteredValues;
  });

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const onReset = (event: Event) => preserveEnteredValuesRef.current(event);
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, [formRef]);
  const clearingDate = status === "COMPLETED" && nextStatus !== "COMPLETED";
  const statusDescribedBy = [
    state.fieldErrors?.status ? `${dialog.formId}-status-error` : "",
    clearingDate ? `${dialog.formId}-clear-date` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <Button type="button" size="sm" variant="secondary" onClick={dialog.openDialog}>
        {correcting ? "Correct return to work" : "Record return to work"}
      </Button>
      <dialog
        ref={dialogRef}
        aria-labelledby={dialog.titleId}
        aria-describedby={dialog.descriptionId}
        className="max-h-[90vh] w-[min(100%,32rem)] overflow-y-auto rounded-lg border border-slate-200 p-0 shadow-xl backdrop:bg-slate-900/40"
        onClose={() => dialog.setOpen(false)}
      >
        <div className="p-5">
          <h2 id={dialog.titleId} className="text-lg font-semibold text-slate-900">
            {correcting ? "Correct return to work" : "Record return to work"}
          </h2>
          <p id={dialog.descriptionId} className="mt-2 text-sm text-slate-600">
            {RETURN_TO_WORK_SECTION_DESCRIPTION}
          </p>
          <form
            ref={formRef}
            action={formAction}
            noValidate
            className="mt-4 space-y-3"
            onSubmit={(event) => {
              const date = dateInput(event.currentTarget);
              if (!date) return;
              rememberDate(date.value);
              submittedDateRef.current = dateValueRef.current;
            }}
            onReset={preserveEnteredValues}
          >
            <input type="hidden" name="absenceId" value={absenceId} />
            <input type="hidden" name="idempotencyKey" value={dialog.idempotencyKey} />
            {expectedUpdatedAt ? (
              <input type="hidden" name="expectedUpdatedAt" value={expectedUpdatedAt} />
            ) : null}
            {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
            <FormAlert>{state.error}</FormAlert>
            <div>
              <FieldLabel htmlFor={`${dialog.formId}-status`} required>
                Return to work
              </FieldLabel>
              <select
                id={`${dialog.formId}-status`}
                name="status"
                value={nextStatus}
                aria-invalid={Boolean(state.fieldErrors?.status)}
                aria-describedby={statusDescribedBy || undefined}
                className={controlClassName("w-full")}
                onChange={(event) => {
                  const next = event.target.value as ReturnToWorkStatus;
                  if (!returnToWorkDateApplies(next)) {
                    dateValueRef.current = completedOn;
                    submittedDateRef.current = null;
                  }
                  setNextStatus(next);
                }}
              >
                {RETURN_TO_WORK_STATUSES.map((option) => (
                  <option key={option} value={option}>
                    {RETURN_TO_WORK_STATUS_LABELS[option]}
                  </option>
                ))}
              </select>
              <FieldError
                id={`${dialog.formId}-status-error`}
                messages={state.fieldErrors?.status}
              />
              {clearingDate ? (
                <p
                  id={`${dialog.formId}-clear-date`}
                  className="mt-2 text-sm text-slate-700"
                >
                  {RETURN_TO_WORK_CLEAR_DATE_MESSAGE}
                </p>
              ) : null}
            </div>
            {returnToWorkDateApplies(nextStatus) ? (
              <div>
                <FieldLabel htmlFor={`${dialog.formId}-completed`} required>
                  Completion date
                </FieldLabel>
                <input
                  key={savedKey}
                  id={`${dialog.formId}-completed`}
                  name="completedOn"
                  type="date"
                  required
                  defaultValue={completedOn}
                  aria-invalid={Boolean(state.fieldErrors?.completedOn)}
                  aria-describedby={
                    state.fieldErrors?.completedOn
                      ? `${dialog.formId}-completed-error`
                      : `${dialog.formId}-completed-hint`
                  }
                  className={controlClassName("w-full")}
                  onChange={(event) => {
                    const next = event.currentTarget.value;
                    if (ignoreDateClear.current && next === "") return;
                    rememberDate(next);
                  }}
                />
                <p
                  id={`${dialog.formId}-completed-hint`}
                  className="mt-1 text-sm text-slate-600"
                >
                  The date this process was completed. This is not a planned
                  follow-up date.
                </p>
                <FieldError
                  id={`${dialog.formId}-completed-error`}
                  messages={state.fieldErrors?.completedOn}
                />
              </div>
            ) : null}
            <div>
              <FieldLabel htmlFor={`${dialog.formId}-note`}>
                Administrative note
              </FieldLabel>
              <textarea
                id={`${dialog.formId}-note`}
                name="note"
                rows={3}
                value={nextNote}
                aria-invalid={Boolean(state.fieldErrors?.note)}
                aria-describedby={`${dialog.formId}-note-hint${
                  state.fieldErrors?.note ? ` ${dialog.formId}-note-error` : ""
                }`}
                className={controlClassName("w-full whitespace-pre-wrap")}
                onChange={(event) => setNextNote(event.target.value)}
              />
              <p id={`${dialog.formId}-note-hint`} className="mt-1 text-sm text-slate-600">
                {RETURN_TO_WORK_NOTE_HELPER}
              </p>
              <FieldError
                id={`${dialog.formId}-note-error`}
                messages={state.fieldErrors?.note}
              />
            </div>
            {correcting ? (
              <div>
                <FieldLabel htmlFor={`${dialog.formId}-reason`} required>
                  Correction reason
                </FieldLabel>
                <textarea
                  id={`${dialog.formId}-reason`}
                  name="correctionReason"
                  required
                  rows={3}
                  value={reason}
                  aria-invalid={Boolean(state.fieldErrors?.correctionReason)}
                  aria-describedby={
                    state.fieldErrors?.correctionReason
                      ? `${dialog.formId}-reason-error`
                      : undefined
                  }
                  className={controlClassName("w-full")}
                  onChange={(event) => setReason(event.target.value)}
                />
                <FieldError
                  id={`${dialog.formId}-reason-error`}
                  messages={state.fieldErrors?.correctionReason}
                />
              </div>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => dialog.setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "Saving…" : "Save return to work"}
              </Button>
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}
