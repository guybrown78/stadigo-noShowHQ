"use client";

import { useActionState, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  createFitNoteAction,
  saveSelfCertificationAction,
  updateFitNoteAction,
  type EvidenceActionState,
} from "@/app/(app)/absence/evidence-actions";
import { FieldError, FormAlert, controlClassName } from "@/components/form";
import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/field";
import {
  FIT_NOTE_STATUSES,
  SELF_CERTIFICATION_STATUSES,
  type FitNoteStatus,
  type SelfCertificationStatus,
} from "@/lib/absence/catalog";
import {
  EVIDENCE_SECTION_DESCRIPTION,
  FIT_NOTE_STATUS_LABELS,
  SELF_CERTIFICATION_STATUS_LABELS,
  fitNoteDateModes,
} from "@/lib/absence/evidence";
import {
  parseCreateFitNoteFormData,
  parseSaveSelfCertificationFormData,
  parseUpdateFitNoteFormData,
} from "@/lib/absence/evidence-schema";
import { withClientValidation } from "@/lib/form";
import { parseLocalDate } from "@/lib/events/dates";

const initialState: EvidenceActionState = {};

function useEvidenceDialog(dialogRef: React.RefObject<HTMLDialogElement | null>) {
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
  fieldErrors: EvidenceActionState["fieldErrors"],
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

function StatusSelect({
  id,
  name,
  value,
  options,
  labels,
  errorId,
  invalid,
  onChange,
}: {
  id: string;
  name: string;
  value: string;
  options: readonly string[];
  labels: Record<string, string>;
  errorId?: string;
  invalid: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <select
      id={id}
      name={name}
      value={value}
      aria-invalid={invalid}
      aria-describedby={errorId}
      className={controlClassName("w-full")}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {labels[option]}
        </option>
      ))}
    </select>
  );
}

function DateField({
  id,
  name,
  label,
  required,
  value,
  errorId,
  messages,
  onChange,
}: {
  id: string;
  name: string;
  label: string;
  required: boolean;
  value: string;
  errorId: string;
  messages?: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <FieldLabel htmlFor={id} required={required}>
        {label}
      </FieldLabel>
      <input
        id={id}
        name={name}
        type="date"
        required={required}
        value={value}
        aria-invalid={Boolean(messages)}
        aria-describedby={messages ? errorId : undefined}
        className={controlClassName("w-full")}
        onChange={(event) => {
          const next = event.target.value;
          if (next === "" || parseLocalDate(next)) {
            onChange(next);
          }
        }}
      />
      <FieldError id={errorId} messages={messages} />
    </div>
  );
}

export function SelfCertificationDialog({
  absenceId,
  status,
  expectedUpdatedAt,
  returnTo,
}: {
  absenceId: string;
  status: SelfCertificationStatus;
  expectedUpdatedAt: string | null;
  returnTo?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const dialog = useEvidenceDialog(dialogRef);
  const correcting = Boolean(expectedUpdatedAt);
  const action = useMemo(
    () =>
      withClientValidation(
        parseSaveSelfCertificationFormData,
        saveSelfCertificationAction,
      ),
    [],
  );
  const [state, formAction, pending] = useActionState(action, initialState);
  const [nextStatus, setNextStatus] = useState(status);
  const [reason, setReason] = useState("");
  usePreserveInvalidInput(formRef, state.fieldErrors);

  return (
    <>
      <Button type="button" size="sm" variant="secondary" onClick={dialog.openDialog}>
        {correcting ? "Edit self-certification" : "Record self-certification"}
      </Button>
      <DialogShell
        dialogRef={dialogRef}
        titleId={dialog.titleId}
        descriptionId={dialog.descriptionId}
        title={correcting ? "Edit self-certification" : "Record self-certification"}
        description="Self-certification is the current position for this sickness. It does not change the sickness status or the record status."
        onClose={() => dialog.setOpen(false)}
      >
        <form
          ref={formRef}
          action={formAction}
          noValidate
          className="mt-4 space-y-3"
          onReset={(event) => event.preventDefault()}
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
              Self-certification
            </FieldLabel>
            <StatusSelect
              id={`${dialog.formId}-status`}
              name="status"
              value={nextStatus}
              options={SELF_CERTIFICATION_STATUSES}
              labels={SELF_CERTIFICATION_STATUS_LABELS}
              invalid={Boolean(state.fieldErrors?.status)}
              errorId={
                state.fieldErrors?.status ? `${dialog.formId}-status-error` : undefined
              }
              onChange={(value) => setNextStatus(value as SelfCertificationStatus)}
            />
            <FieldError
              id={`${dialog.formId}-status-error`}
              messages={state.fieldErrors?.status}
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
              {pending ? "Saving…" : "Save self-certification"}
            </Button>
          </div>
        </form>
      </DialogShell>
    </>
  );
}

function FitNoteFields({
  formId,
  status,
  requestedDate,
  receivedDate,
  note,
  fieldErrors,
  onStatus,
  onRequestedDate,
  onReceivedDate,
  onNote,
}: {
  formId: string;
  status: FitNoteStatus;
  requestedDate: string;
  receivedDate: string;
  note: string;
  fieldErrors?: EvidenceActionState["fieldErrors"];
  onStatus: (status: FitNoteStatus) => void;
  onRequestedDate: (value: string) => void;
  onReceivedDate: (value: string) => void;
  onNote: (value: string) => void;
}) {
  const modes = fitNoteDateModes(status);
  return (
    <>
      <div>
        <FieldLabel htmlFor={`${formId}-status`} required>
          Fit note
        </FieldLabel>
        <StatusSelect
          id={`${formId}-status`}
          name="status"
          value={status}
          options={FIT_NOTE_STATUSES}
          labels={FIT_NOTE_STATUS_LABELS}
          invalid={Boolean(fieldErrors?.status)}
          errorId={fieldErrors?.status ? `${formId}-status-error` : undefined}
          onChange={(value) => {
            const next = value as FitNoteStatus;
            onStatus(next);
            const nextModes = fitNoteDateModes(next);
            if (nextModes.requested === "forbidden") {
              onRequestedDate("");
            }
            if (nextModes.received === "forbidden") {
              onReceivedDate("");
            }
          }}
        />
        <FieldError id={`${formId}-status-error`} messages={fieldErrors?.status} />
      </div>
      {modes.requested !== "forbidden" ? (
        <DateField
          id={`${formId}-requested`}
          name="requestedDate"
          label="Date requested"
          required={modes.requested === "required"}
          value={requestedDate}
          errorId={`${formId}-requested-error`}
          messages={fieldErrors?.requestedDate}
          onChange={onRequestedDate}
        />
      ) : null}
      {modes.received !== "forbidden" ? (
        <DateField
          id={`${formId}-received`}
          name="receivedDate"
          label="Date received"
          required
          value={receivedDate}
          errorId={`${formId}-received-error`}
          messages={fieldErrors?.receivedDate}
          onChange={onReceivedDate}
        />
      ) : null}
      <div>
        <FieldLabel htmlFor={`${formId}-note`}>Administrative note</FieldLabel>
        <textarea
          id={`${formId}-note`}
          name="note"
          rows={3}
          value={note}
          aria-invalid={Boolean(fieldErrors?.note)}
          aria-describedby={fieldErrors?.note ? `${formId}-note-error` : undefined}
          className={controlClassName("w-full whitespace-pre-wrap")}
          onChange={(event) => onNote(event.target.value)}
        />
        <FieldError id={`${formId}-note-error`} messages={fieldErrors?.note} />
      </div>
    </>
  );
}

export function AddFitNoteDialog({
  absenceId,
  todayIso,
  returnTo,
}: {
  absenceId: string;
  todayIso?: string;
  returnTo?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const dialog = useEvidenceDialog(dialogRef);
  const parse = useMemo(
    () => (formData: FormData) => parseCreateFitNoteFormData(formData, todayIso),
    [todayIso],
  );
  const action = useMemo(
    () => withClientValidation(parse, createFitNoteAction),
    [parse],
  );
  const [state, formAction, pending] = useActionState(action, initialState);
  const [status, setStatus] = useState<FitNoteStatus>("REQUIRED");
  const [requestedDate, setRequestedDate] = useState("");
  const [receivedDate, setReceivedDate] = useState("");
  const [note, setNote] = useState("");
  usePreserveInvalidInput(formRef, state.fieldErrors);

  return (
    <>
      <Button type="button" size="sm" onClick={dialog.openDialog}>
        Add fit note
      </Button>
      <DialogShell
        dialogRef={dialogRef}
        titleId={dialog.titleId}
        descriptionId={dialog.descriptionId}
        title="Add fit note"
        description={EVIDENCE_SECTION_DESCRIPTION}
        onClose={() => dialog.setOpen(false)}
      >
        <form
          ref={formRef}
          action={formAction}
          noValidate
          className="mt-4 space-y-3"
          onReset={(event) => event.preventDefault()}
        >
          <input type="hidden" name="absenceId" value={absenceId} />
          <input type="hidden" name="idempotencyKey" value={dialog.idempotencyKey} />
          {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
          <FormAlert>{state.error}</FormAlert>
          <FitNoteFields
            formId={dialog.formId}
            status={status}
            requestedDate={requestedDate}
            receivedDate={receivedDate}
            note={note}
            fieldErrors={state.fieldErrors}
            onStatus={setStatus}
            onRequestedDate={setRequestedDate}
            onReceivedDate={setReceivedDate}
            onNote={setNote}
          />
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
              {pending ? "Adding…" : "Add fit note"}
            </Button>
          </div>
        </form>
      </DialogShell>
    </>
  );
}

export function EditFitNoteDialog({
  fitNoteId,
  status,
  requestedDate,
  receivedDate,
  note,
  expectedUpdatedAt,
  todayIso,
  returnTo,
}: {
  fitNoteId: string;
  status: FitNoteStatus;
  requestedDate: string;
  receivedDate: string;
  note: string;
  expectedUpdatedAt: string;
  todayIso?: string;
  returnTo?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const dialog = useEvidenceDialog(dialogRef);
  const parse = useMemo(
    () => (formData: FormData) => parseUpdateFitNoteFormData(formData, todayIso),
    [todayIso],
  );
  const action = useMemo(
    () => withClientValidation(parse, updateFitNoteAction),
    [parse],
  );
  const [state, formAction, pending] = useActionState(action, initialState);
  const [nextStatus, setNextStatus] = useState<FitNoteStatus>(status);
  const [nextRequested, setNextRequested] = useState(requestedDate);
  const [nextReceived, setNextReceived] = useState(receivedDate);
  const [nextNote, setNextNote] = useState(note);
  const [reason, setReason] = useState("");
  usePreserveInvalidInput(formRef, state.fieldErrors);

  return (
    <>
      <Button type="button" size="sm" variant="secondary" onClick={dialog.openDialog}>
        Edit fit note
      </Button>
      <DialogShell
        dialogRef={dialogRef}
        titleId={dialog.titleId}
        descriptionId={dialog.descriptionId}
        title="Edit fit note"
        description="Correcting a saved fit note needs a reason. This does not complete a follow-up."
        onClose={() => dialog.setOpen(false)}
      >
        <form
          ref={formRef}
          action={formAction}
          noValidate
          className="mt-4 space-y-3"
          onReset={(event) => event.preventDefault()}
        >
          <input type="hidden" name="fitNoteId" value={fitNoteId} />
          <input type="hidden" name="expectedUpdatedAt" value={expectedUpdatedAt} />
          <input type="hidden" name="idempotencyKey" value={dialog.idempotencyKey} />
          {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
          <FormAlert>{state.error}</FormAlert>
          <FitNoteFields
            formId={dialog.formId}
            status={nextStatus}
            requestedDate={nextRequested}
            receivedDate={nextReceived}
            note={nextNote}
            fieldErrors={state.fieldErrors}
            onStatus={setNextStatus}
            onRequestedDate={setNextRequested}
            onReceivedDate={setNextReceived}
            onNote={setNextNote}
          />
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
              {pending ? "Saving…" : "Save fit note"}
            </Button>
          </div>
        </form>
      </DialogShell>
    </>
  );
}
