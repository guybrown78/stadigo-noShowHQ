"use client";

import { useActionState, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  cancelFollowUpAction,
  completeFollowUpAction,
  createFollowUpAction,
  updateFollowUpAction,
  type FollowUpActionState,
} from "@/app/(app)/absence/follow-up-actions";
import { FieldError, FormAlert, controlClassName } from "@/components/form";
import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/field";
import { withClientValidation } from "@/lib/form";
import {
  parseCancelFollowUpFormData,
  parseCompleteFollowUpFormData,
  parseCreateFollowUpFormData,
  parseUpdateFollowUpFormData,
} from "@/lib/absence/follow-up-schema";
import { parseLocalDate } from "@/lib/events/dates";

const initialState: FollowUpActionState = {};

function useFollowUpDialog(
  dialogRef: React.RefObject<HTMLDialogElement | null>,
) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const formId = useId();
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [dialogRef, open]);

  return {
    setOpen,
    titleId,
    descriptionId,
    formId,
    idempotencyKey,
  };
}

function usePreserveInvalidInput(
  formRef: React.RefObject<HTMLFormElement | null>,
  fieldErrors: FollowUpActionState["fieldErrors"],
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

function ContextList({
  staffName,
  staffIdNumber,
  typeLabel,
  context,
}: {
  staffName: string;
  staffIdNumber: string;
  typeLabel: string;
  context: string[];
}) {
  return (
    <dl className="mt-4 grid gap-2 text-sm">
      <div>
        <dt className="font-medium text-slate-500">Staff</dt>
        <dd className="text-slate-900">
          {staffName} · {staffIdNumber}
        </dd>
      </div>
      <div>
        <dt className="font-medium text-slate-500">Absence</dt>
        <dd className="break-words text-slate-900">
          {typeLabel}
          {context.length ? ` · ${context.join(" · ")}` : ""}
        </dd>
      </div>
    </dl>
  );
}

function DialogShell({
  dialogRef,
  titleId,
  descriptionId,
  title,
  description,
  onClose,
  children,
}: {
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  titleId: string;
  descriptionId: string;
  title: string;
  description: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="max-h-[90vh] w-[min(100%,32rem)] overflow-y-auto rounded-lg border border-slate-200 p-0 shadow-xl backdrop:bg-slate-900/40"
      onClose={onClose}
    >
      <div className="p-5">
        <h2 id={titleId} className="text-lg font-semibold text-slate-900">
          {title}
        </h2>
        <p id={descriptionId} className="mt-2 text-sm text-slate-600">
          {description}
        </p>
        {children}
      </div>
    </dialog>
  );
}

export function AddFollowUpDialog({
  absenceId,
  staffName,
  staffIdNumber,
  typeLabel,
  context,
  returnTo,
}: {
  absenceId: string;
  staffName: string;
  staffIdNumber: string;
  typeLabel: string;
  context: string[];
  returnTo?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const dialog = useFollowUpDialog(dialogRef);
  const action = useMemo(
    () => withClientValidation(parseCreateFollowUpFormData, createFollowUpAction),
    [],
  );
  const [state, formAction, pending] = useActionState(action, initialState);
  const [dueDate, setDueDate] = useState("");
  const [details, setDetails] = useState("");
  usePreserveInvalidInput(formRef, state.fieldErrors);

  return (
    <>
      <Button type="button" size="sm" onClick={() => dialog.setOpen(true)}>
        Add follow-up
      </Button>
      <DialogShell
          dialogRef={dialogRef}
          titleId={dialog.titleId}
          descriptionId={dialog.descriptionId}
          title="Add follow-up"
          description="Schedule an operational action for this absence. This does not change the absence status."
          onClose={() => dialog.setOpen(false)}
        >
          <ContextList
            staffName={staffName}
            staffIdNumber={staffIdNumber}
            typeLabel={typeLabel}
            context={context}
          />
          <form
            ref={formRef}
            action={formAction}
            noValidate
            className="mt-4 space-y-3"
            onReset={(event) => event.preventDefault()}
          >
            <input type="hidden" name="absenceId" value={absenceId} />
            <input type="hidden" name="idempotencyKey" value={dialog.idempotencyKey} />
            {returnTo ? (
              <input type="hidden" name="returnTo" value={returnTo} />
            ) : null}
            <FormAlert>{state.error}</FormAlert>
            <div>
              <FieldLabel htmlFor={`${dialog.formId}-due`} required>
                Due date
              </FieldLabel>
              <input
                id={`${dialog.formId}-due`}
                name="dueDate"
                type="date"
                required
                value={dueDate}
                aria-invalid={Boolean(state.fieldErrors?.dueDate)}
                aria-describedby={
                  state.fieldErrors?.dueDate
                    ? `${dialog.formId}-due-error`
                    : undefined
                }
                className={controlClassName("w-full")}
                onChange={(event) => {
                  const next = event.target.value;
                  if (next === "" || parseLocalDate(next)) {
                    setDueDate(next);
                  }
                }}
              />
              <FieldError
                id={`${dialog.formId}-due-error`}
                messages={state.fieldErrors?.dueDate}
              />
            </div>
            <div>
              <FieldLabel htmlFor={`${dialog.formId}-details`} required>
                Follow-up details
              </FieldLabel>
              <textarea
                id={`${dialog.formId}-details`}
                name="details"
                required
                rows={4}
                value={details}
                aria-invalid={Boolean(state.fieldErrors?.details)}
                aria-describedby={
                  state.fieldErrors?.details
                    ? `${dialog.formId}-details-error`
                    : undefined
                }
                className={controlClassName("w-full whitespace-pre-wrap")}
                onChange={(event) => setDetails(event.target.value)}
              />
              <FieldError
                id={`${dialog.formId}-details-error`}
                messages={state.fieldErrors?.details}
              />
            </div>
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
                {pending ? "Adding…" : "Add follow-up"}
              </Button>
            </div>
          </form>
        </DialogShell>
    </>
  );
}

export function EditFollowUpDialog({
  followUpId,
  dueDate,
  details,
  expectedUpdatedAt,
  staffName,
  staffIdNumber,
  typeLabel,
  context,
  returnTo,
}: {
  followUpId: string;
  dueDate: string;
  details: string;
  expectedUpdatedAt: string;
  staffName: string;
  staffIdNumber: string;
  typeLabel: string;
  context: string[];
  returnTo?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const dialog = useFollowUpDialog(dialogRef);
  const action = useMemo(
    () => withClientValidation(parseUpdateFollowUpFormData, updateFollowUpAction),
    [],
  );
  const [state, formAction, pending] = useActionState(action, initialState);
  const [nextDue, setNextDue] = useState(dueDate);
  const [nextDetails, setNextDetails] = useState(details);
  const [reason, setReason] = useState("");
  usePreserveInvalidInput(formRef, state.fieldErrors);

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => dialog.setOpen(true)}
      >
        Edit follow-up
      </Button>
      <DialogShell
          dialogRef={dialogRef}
          titleId={dialog.titleId}
          descriptionId={dialog.descriptionId}
          title="Edit follow-up"
          description="Change the due date or details. A correction reason is required."
          onClose={() => dialog.setOpen(false)}
        >
          <ContextList
            staffName={staffName}
            staffIdNumber={staffIdNumber}
            typeLabel={typeLabel}
            context={context}
          />
          <form
            ref={formRef}
            action={formAction}
            noValidate
            className="mt-4 space-y-3"
          >
            <input type="hidden" name="followUpId" value={followUpId} />
            <input type="hidden" name="expectedUpdatedAt" value={expectedUpdatedAt} />
            <input type="hidden" name="idempotencyKey" value={dialog.idempotencyKey} />
            {returnTo ? (
              <input type="hidden" name="returnTo" value={returnTo} />
            ) : null}
            <FormAlert>{state.error}</FormAlert>
            <div>
              <FieldLabel htmlFor={`${dialog.formId}-due`} required>
                Due date
              </FieldLabel>
              <input
                id={`${dialog.formId}-due`}
                name="dueDate"
                type="date"
                required
                value={nextDue}
                aria-invalid={Boolean(state.fieldErrors?.dueDate)}
                aria-describedby={
                  state.fieldErrors?.dueDate
                    ? `${dialog.formId}-due-error`
                    : undefined
                }
                className={controlClassName("w-full")}
                onChange={(event) => {
                  const next = event.target.value;
                  if (next === "" || parseLocalDate(next)) {
                    setNextDue(next);
                  }
                }}
              />
              <FieldError
                id={`${dialog.formId}-due-error`}
                messages={state.fieldErrors?.dueDate}
              />
            </div>
            <div>
              <FieldLabel htmlFor={`${dialog.formId}-details`} required>
                Follow-up details
              </FieldLabel>
              <textarea
                id={`${dialog.formId}-details`}
                name="details"
                required
                rows={4}
                value={nextDetails}
                aria-invalid={Boolean(state.fieldErrors?.details)}
                aria-describedby={
                  state.fieldErrors?.details
                    ? `${dialog.formId}-details-error`
                    : undefined
                }
                className={controlClassName("w-full")}
                onChange={(event) => setNextDetails(event.target.value)}
              />
              <FieldError
                id={`${dialog.formId}-details-error`}
                messages={state.fieldErrors?.details}
              />
            </div>
            <div>
              <FieldLabel htmlFor={`${dialog.formId}-reason`} required>
                Correction reason
              </FieldLabel>
              <textarea
                id={`${dialog.formId}-reason`}
                name="correctionReason"
                required
                rows={3}
                maxLength={500}
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
                {pending ? "Saving…" : "Save follow-up"}
              </Button>
            </div>
          </form>
        </DialogShell>
    </>
  );
}

export function CompleteFollowUpDialog({
  followUpId,
  details,
  expectedUpdatedAt,
  staffName,
  staffIdNumber,
  typeLabel,
  context,
  returnTo,
}: {
  followUpId: string;
  details: string;
  expectedUpdatedAt: string;
  staffName: string;
  staffIdNumber: string;
  typeLabel: string;
  context: string[];
  returnTo?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const dialog = useFollowUpDialog(dialogRef);
  const action = useMemo(
    () =>
      withClientValidation(
        (formData) => parseCompleteFollowUpFormData(formData, details),
        completeFollowUpAction,
      ),
    [details],
  );
  const [state, formAction, pending] = useActionState(action, initialState);
  const [notes, setNotes] = useState("");
  usePreserveInvalidInput(formRef, state.fieldErrors);

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => dialog.setOpen(true)}
      >
        Complete follow-up
      </Button>
      <DialogShell
          dialogRef={dialogRef}
          titleId={dialog.titleId}
          descriptionId={dialog.descriptionId}
          title="Complete follow-up"
          description="Record the outcome for this staff member and absence. Completing does not change the absence status."
          onClose={() => dialog.setOpen(false)}
        >
          <ContextList
            staffName={staffName}
            staffIdNumber={staffIdNumber}
            typeLabel={typeLabel}
            context={context}
          />
          <p className="mt-3 whitespace-pre-wrap break-words text-sm text-slate-700">
            {details}
          </p>
          <form
            ref={formRef}
            action={formAction}
            noValidate
            className="mt-4 space-y-3"
          >
            <input type="hidden" name="followUpId" value={followUpId} />
            <input type="hidden" name="expectedUpdatedAt" value={expectedUpdatedAt} />
            <input type="hidden" name="idempotencyKey" value={dialog.idempotencyKey} />
            {returnTo ? (
              <input type="hidden" name="returnTo" value={returnTo} />
            ) : null}
            <FormAlert>{state.error}</FormAlert>
            <div>
              <FieldLabel htmlFor={`${dialog.formId}-outcome`} required>
                Outcome
              </FieldLabel>
              <textarea
                id={`${dialog.formId}-outcome`}
                name="completionNotes"
                required
                rows={4}
                value={notes}
                aria-invalid={Boolean(state.fieldErrors?.completionNotes)}
                aria-describedby={
                  state.fieldErrors?.completionNotes
                    ? `${dialog.formId}-outcome-error`
                    : undefined
                }
                className={controlClassName("w-full")}
                onChange={(event) => setNotes(event.target.value)}
              />
              <FieldError
                id={`${dialog.formId}-outcome-error`}
                messages={state.fieldErrors?.completionNotes}
              />
            </div>
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
                {pending ? "Completing…" : "Complete follow-up"}
              </Button>
            </div>
          </form>
        </DialogShell>
    </>
  );
}

export function CancelFollowUpDialog({
  followUpId,
  expectedUpdatedAt,
  staffName,
  staffIdNumber,
  typeLabel,
  context,
  returnTo,
}: {
  followUpId: string;
  expectedUpdatedAt: string;
  staffName: string;
  staffIdNumber: string;
  typeLabel: string;
  context: string[];
  returnTo?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const dialog = useFollowUpDialog(dialogRef);
  const action = useMemo(
    () => withClientValidation(parseCancelFollowUpFormData, cancelFollowUpAction),
    [],
  );
  const [state, formAction, pending] = useActionState(action, initialState);
  const [reason, setReason] = useState("");
  usePreserveInvalidInput(formRef, state.fieldErrors);

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => dialog.setOpen(true)}
      >
        Cancel follow-up
      </Button>
      <DialogShell
          dialogRef={dialogRef}
          titleId={dialog.titleId}
          descriptionId={dialog.descriptionId}
          title="Cancel follow-up"
          description="Cancel this follow-up when it is no longer required. The absence stays as it is, and the follow-up remains in the history."
          onClose={() => dialog.setOpen(false)}
        >
          <ContextList
            staffName={staffName}
            staffIdNumber={staffIdNumber}
            typeLabel={typeLabel}
            context={context}
          />
          <form
            ref={formRef}
            action={formAction}
            noValidate
            className="mt-4 space-y-3"
          >
            <input type="hidden" name="followUpId" value={followUpId} />
            <input type="hidden" name="expectedUpdatedAt" value={expectedUpdatedAt} />
            <input type="hidden" name="idempotencyKey" value={dialog.idempotencyKey} />
            {returnTo ? (
              <input type="hidden" name="returnTo" value={returnTo} />
            ) : null}
            <FormAlert>{state.error}</FormAlert>
            <div>
              <FieldLabel htmlFor={`${dialog.formId}-reason`} required>
                Cancellation reason
              </FieldLabel>
              <textarea
                id={`${dialog.formId}-reason`}
                name="cancellationReason"
                required
                rows={3}
                maxLength={500}
                value={reason}
                aria-invalid={Boolean(state.fieldErrors?.cancellationReason)}
                aria-describedby={
                  state.fieldErrors?.cancellationReason
                    ? `${dialog.formId}-reason-error`
                    : undefined
                }
                className={controlClassName("w-full")}
                onChange={(event) => setReason(event.target.value)}
              />
              <FieldError
                id={`${dialog.formId}-reason-error`}
                messages={state.fieldErrors?.cancellationReason}
              />
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => dialog.setOpen(false)}
              >
                Keep follow-up
              </Button>
              <Button type="submit" variant="danger" size="sm" disabled={pending}>
                {pending ? "Cancelling…" : "Cancel follow-up"}
              </Button>
            </div>
          </form>
        </DialogShell>
    </>
  );
}
