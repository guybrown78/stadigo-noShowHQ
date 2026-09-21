"use client";

import { useActionState, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  updateSicknessEpisodeAction,
  type AbsenceActionState,
} from "@/app/(app)/absence/actions";
import { FieldError, FormAlert, controlClassName } from "@/components/form";
import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/field";
import { withClientValidation } from "@/lib/form";
import type { SicknessEpisodeState } from "@/lib/absence/catalog";
import { parseUpdateSicknessEpisodeFormData } from "@/lib/absence/schema";
import {
  SICKNESS_ENDED_DATE_HINT,
  SICKNESS_EPISODE_UPDATE_LABEL,
  episodeUpdateRequiresClearConfirmation,
  episodeUpdateRequiresCorrectionReason,
  sicknessEpisodeStateLabel,
} from "@/lib/absence/sickness";
import { parseLocalDate } from "@/lib/events/dates";

const initialState: AbsenceActionState = {};

export function UpdateSicknessEpisodeDialog({
  absenceId,
  staffName,
  reportedDateDisplay,
  firstWorkingDayDisplay,
  firstWorkingDaySick,
  sicknessStartedDate,
  currentEpisodeState,
  currentSicknessEndedDate,
  expectedUpdatedAt,
  todayIso,
  timeZone,
  returnTo,
}: {
  absenceId: string;
  staffName: string;
  reportedDateDisplay: string;
  firstWorkingDayDisplay: string;
  firstWorkingDaySick: string;
  sicknessStartedDate: string;
  currentEpisodeState: SicknessEpisodeState;
  currentSicknessEndedDate: string;
  expectedUpdatedAt: string;
  todayIso: string;
  timeZone: string;
  returnTo?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const formId = useId();
  const hintId = `${formId}-ended-hint`;
  const action = useMemo(
    () =>
      withClientValidation(
        parseUpdateSicknessEpisodeFormData,
        updateSicknessEpisodeAction,
      ),
    [],
  );
  const [state, formAction, pending] = useActionState(action, initialState);
  const [episodeState, setEpisodeState] = useState<"ONGOING" | "ENDED">(
    currentEpisodeState === "ENDED" ? "ENDED" : "ONGOING",
  );
  const [sicknessEndedDate, setSicknessEndedDate] = useState(
    currentSicknessEndedDate,
  );
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (!state.fieldErrors) {
      return;
    }
    const firstInvalid = formRef.current?.querySelector<HTMLElement>(
      "[aria-invalid='true']",
    );
    firstInvalid?.focus();
  }, [state.fieldErrors]);

  const nextEndedDateIso =
    episodeState === "ENDED" ? sicknessEndedDate || null : null;
  const needsReason = episodeUpdateRequiresCorrectionReason({
    currentState: currentEpisodeState,
    currentEndedDateIso: currentSicknessEndedDate || null,
    nextState: episodeState,
    nextEndedDateIso,
  });
  const needsClearConfirmation = episodeUpdateRequiresClearConfirmation({
    currentState: currentEpisodeState,
    nextState: episodeState,
  });

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {SICKNESS_EPISODE_UPDATE_LABEL}
      </Button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="max-h-[90vh] w-[min(100%,32rem)] overflow-y-auto rounded-lg border border-slate-200 p-0 shadow-xl backdrop:bg-slate-900/40"
        onClose={() => setOpen(false)}
      >
        <div className="p-5">
          <h2 id={titleId} className="text-lg font-semibold text-slate-900">
            {SICKNESS_EPISODE_UPDATE_LABEL}
          </h2>
          <p id={descriptionId} className="mt-2 text-sm text-slate-600">
            Record whether this sickness episode is ongoing or has ended. This
            does not archive the record or record a return to work.
          </p>
          <dl className="mt-4 grid gap-2 text-sm">
            <div>
              <dt className="font-medium text-slate-500">Staff</dt>
              <dd className="text-slate-900">{staffName}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Date sickness reported</dt>
              <dd className="text-slate-900">{reportedDateDisplay}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">First day sick from work</dt>
              <dd className="text-slate-900">{firstWorkingDayDisplay}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Current episode status</dt>
              <dd className="text-slate-900">
                {sicknessEpisodeStateLabel(currentEpisodeState)}
              </dd>
            </div>
          </dl>
          <form
            ref={formRef}
            action={formAction}
            noValidate
            className="mt-4 space-y-3"
          >
            <input type="hidden" name="absenceId" value={absenceId} />
            <input type="hidden" name="expectedUpdatedAt" value={expectedUpdatedAt} />
            <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
            <input type="hidden" name="currentEpisodeState" value={currentEpisodeState} />
            <input
              type="hidden"
              name="currentSicknessEndedDate"
              value={currentSicknessEndedDate}
            />
            <input type="hidden" name="firstWorkingDaySick" value={firstWorkingDaySick} />
            <input type="hidden" name="sicknessStartedDate" value={sicknessStartedDate} />
            <input type="hidden" name="todayIso" value={todayIso} />
            {returnTo ? (
              <input type="hidden" name="returnTo" value={returnTo} />
            ) : null}
            <FormAlert>{state.error}</FormAlert>
            <fieldset
              tabIndex={-1}
              aria-invalid={Boolean(state.fieldErrors?.episodeState)}
              aria-describedby={
                state.fieldErrors?.episodeState
                  ? `${formId}-state-error`
                  : undefined
              }
            >
              <legend className="mb-2 text-sm font-medium text-slate-700">
                Episode status <span className="text-red-700">*</span>
              </legend>
              <div className="space-y-2">
                <label className="flex items-start gap-2 text-sm text-slate-800">
                  <input
                    type="radio"
                    name="episodeState"
                    value="ONGOING"
                    checked={episodeState === "ONGOING"}
                    onChange={() => {
                      setEpisodeState("ONGOING");
                      setSicknessEndedDate("");
                    }}
                  />
                  <span>Ongoing</span>
                </label>
                <label className="flex items-start gap-2 text-sm text-slate-800">
                  <input
                    type="radio"
                    name="episodeState"
                    value="ENDED"
                    checked={episodeState === "ENDED"}
                    onChange={() => setEpisodeState("ENDED")}
                  />
                  <span>Ended</span>
                </label>
              </div>
              <FieldError
                id={`${formId}-state-error`}
                messages={state.fieldErrors?.episodeState}
              />
            </fieldset>
            {episodeState === "ENDED" ? (
              <div>
                <FieldLabel htmlFor={`${formId}-ended`} required>
                  Sickness ended
                </FieldLabel>
                <input
                  id={`${formId}-ended`}
                  name="sicknessEndedDate"
                  type="date"
                  value={sicknessEndedDate}
                  onChange={(event) => {
                    const next = event.target.value;
                    if (next === "" || parseLocalDate(next)) {
                      setSicknessEndedDate(next);
                    }
                  }}
                  aria-invalid={Boolean(state.fieldErrors?.sicknessEndedDate)}
                  aria-describedby={
                    [
                      hintId,
                      state.fieldErrors?.sicknessEndedDate
                        ? `${formId}-ended-error`
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ") || undefined
                  }
                  className={controlClassName("w-full")}
                />
                <p id={hintId} className="mt-1 text-xs text-slate-500">
                  {SICKNESS_ENDED_DATE_HINT} Calendar dates use {timeZone}.
                </p>
                <FieldError
                  id={`${formId}-ended-error`}
                  messages={state.fieldErrors?.sicknessEndedDate}
                />
              </div>
            ) : (
              <input type="hidden" name="sicknessEndedDate" value="" />
            )}
            {needsReason ? (
              <div>
                <FieldLabel htmlFor={`${formId}-reason`} required>
                  Correction reason
                </FieldLabel>
                <textarea
                  id={`${formId}-reason`}
                  name="correctionReason"
                  rows={3}
                  maxLength={500}
                  aria-invalid={Boolean(state.fieldErrors?.correctionReason)}
                  aria-describedby={
                    state.fieldErrors?.correctionReason
                      ? `${formId}-reason-error`
                      : undefined
                  }
                  className={controlClassName("w-full")}
                />
                <FieldError
                  id={`${formId}-reason-error`}
                  messages={state.fieldErrors?.correctionReason}
                />
              </div>
            ) : null}
            {needsClearConfirmation ? (
              <div>
                <label className="flex items-start gap-2 text-sm text-slate-800">
                  <input
                    type="checkbox"
                    name="confirmClearEndDate"
                    className="mt-1"
                    aria-invalid={Boolean(state.fieldErrors?.confirmClearEndDate)}
                    aria-describedby={
                      state.fieldErrors?.confirmClearEndDate
                        ? `${formId}-confirm-error`
                        : undefined
                    }
                  />
                  <span>
                    I confirm the previously recorded end date for {staffName}{" "}
                    was incorrect. This does not record a relapse, reopen a
                    closed case, or state that the staff member has returned to
                    work.
                  </span>
                </label>
                <FieldError
                  id={`${formId}-confirm-error`}
                  messages={state.fieldErrors?.confirmClearEndDate}
                />
              </div>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending} size="sm">
                {pending ? "Saving…" : "Save episode update"}
              </Button>
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}
