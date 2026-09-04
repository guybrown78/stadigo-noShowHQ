"use client";

import Link from "next/link";
import { useActionState, useId, useMemo, useState } from "react";
import {
  correctCancellationAction,
  createCancellationAction,
  type AbsenceActionState,
} from "@/app/(app)/absence/actions";
import { EventSearchPicker } from "@/components/absence/event-search-picker";
import { StaffSearchPicker } from "@/components/absence/staff-search-picker";
import { FieldError, FormAlert, controlClassName } from "@/components/form";
import {
  formatCalendarNotice,
  formatDurationMinutes,
  NOTICE_BASIS_LABELS,
} from "@/lib/absence/display";
import { previewNotice } from "@/lib/absence/notice";
import type { AbsenceEventOption, AbsenceStaffOption } from "@/lib/absence/queries";
import {
  parseCancellationFormData,
  parseCorrectCancellationFormData,
} from "@/lib/absence/schema";
import {
  hourOptions,
  joinTime,
  londonTodayIso,
  minuteOptions,
  parseLocalDate,
  splitTime,
} from "@/lib/events/dates";
import { withClientValidation } from "@/lib/form";

const initialState: AbsenceActionState = {};

function OptionalTimeFields({
  id,
  value,
  onChange,
  describedBy,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  describedBy?: string;
  invalid?: boolean;
}) {
  const { hour, minute } = splitTime(value);
  const hours = hourOptions();
  const minutes = minuteOptions(value);
  const selectClass = controlClassName("min-w-[4.5rem] bg-white");

  function commit(nextHour: string, nextMinute: string) {
    onChange(joinTime(nextHour, nextMinute));
  }

  return (
    <div className="flex items-center gap-2">
      <select
        id={`${id}-hour`}
        aria-label="Reported hour"
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className={selectClass}
        value={hour}
        onChange={(event) => commit(event.target.value, minute || "00")}
      >
        <option value="">—</option>
        {hours.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <span className="text-slate-500">:</span>
      <select
        id={`${id}-minute`}
        aria-label="Reported minute"
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className={selectClass}
        value={hour ? minute || "00" : ""}
        disabled={!hour}
        onChange={(event) => commit(hour, event.target.value)}
      >
        {(hour ? minutes : ["00"]).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

export function CancellationForm({
  mode,
  absenceId,
  defaultReportedDate,
  initialStaff,
  initialEvent,
  initialValues,
}: {
  mode: "create" | "edit";
  absenceId?: string;
  defaultReportedDate: string;
  initialStaff?: AbsenceStaffOption | null;
  initialEvent?: AbsenceEventOption | null;
  initialValues?: {
    reportedDate?: string;
    reportedTime?: string | null;
    reason?: string;
    notes?: string | null;
  };
}) {
  const action =
    mode === "create" ? createCancellationAction : correctCancellationAction;
  const parse =
    mode === "create"
      ? parseCancellationFormData
      : parseCorrectCancellationFormData;
  const validatedAction = useMemo(
    () => withClientValidation(parse, action),
    [action, parse],
  );
  const [state, formAction, pending] = useActionState(
    validatedAction,
    initialState,
  );
  const formId = useId();
  const [selectedEvent, setSelectedEvent] = useState<AbsenceEventOption | null>(
    initialEvent ?? null,
  );
  const [reportedDate, setReportedDate] = useState(
    initialValues?.reportedDate ?? defaultReportedDate ?? londonTodayIso(),
  );
  const [reportedTime, setReportedTime] = useState(
    initialValues?.reportedTime ?? "",
  );
  // Keep typed fields controlled so a failed save (e.g. missing correction
  // reason) does not reset them to the previously saved defaultValue.
  const [reason, setReason] = useState(initialValues?.reason ?? "");
  const [notes, setNotes] = useState(initialValues?.notes ?? "");
  const [correctionReason, setCorrectionReason] = useState("");
  const [retrospectiveConfirmed, setRetrospectiveConfirmed] = useState(false);

  const notice = previewNotice({
    eventDate: selectedEvent?.eventDate,
    eventStartTime: selectedEvent?.startTime,
    reportedDate,
    reportedTime: reportedTime || null,
  });

  return (
    <form action={formAction} noValidate className="space-y-6">
      {mode === "edit" && absenceId ? (
        <input type="hidden" name="absenceId" value={absenceId} />
      ) : null}
      <input type="hidden" name="type" value="CANCELLATION" />
      <input type="hidden" name="reportedTime" value={reportedTime} />
      <FormAlert>{state.error}</FormAlert>
      {state.existingAbsenceId ? (
        <p className="text-sm text-slate-700">
          <Link
            href={`/absence/${state.existingAbsenceId}`}
            className="font-medium underline"
          >
            View the existing cancellation
          </Link>
        </p>
      ) : null}

      <fieldset>
        <legend className="text-sm font-medium text-slate-700">
          Absence type
        </legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <p className="rounded-md border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-medium text-white">
            Cancellation
          </p>
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
            AWOL · Coming soon
          </p>
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
            Sickness · Coming soon
          </p>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          A cancellation means the staff member notified the organisation before
          the event. You can still record a late or retrospective cancellation
          when notice arrived after the event.
        </p>
      </fieldset>

      <StaffSearchPicker
        initialStaff={initialStaff}
        errorId={`${formId}-staff-error`}
        errorMessages={state.fieldErrors?.staffId}
      />

      <EventSearchPicker
        initialEvent={initialEvent}
        errorId={`${formId}-event-error`}
        errorMessages={state.fieldErrors?.eventId}
        onSelect={setSelectedEvent}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor={`${formId}-date`}
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Cancellation reported date <span className="text-red-700">*</span>
          </label>
          <input
            id={`${formId}-date`}
            name="reportedDate"
            type="date"
            value={reportedDate}
            onChange={(event) => {
              const next = event.target.value;
              // Native date inputs normally emit "" or YYYY-MM-DD. Ignore anything
              // else so an intermediate/invalid value cannot crash notice preview.
              if (next === "" || parseLocalDate(next)) {
                setReportedDate(next);
              }
            }}
            aria-invalid={Boolean(state.fieldErrors?.reportedDate)}
            aria-describedby={
              state.fieldErrors?.reportedDate
                ? `${formId}-date-error`
                : undefined
            }
            className={controlClassName("w-full")}
          />
          <FieldError
            id={`${formId}-date-error`}
            messages={state.fieldErrors?.reportedDate}
          />
        </div>
        <div>
          <p
            id={`${formId}-time-label`}
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Cancellation reported time
          </p>
          <OptionalTimeFields
            id={`${formId}-time`}
            value={reportedTime}
            onChange={setReportedTime}
            invalid={Boolean(state.fieldErrors?.reportedTime)}
            describedBy={
              state.fieldErrors?.reportedTime
                ? `${formId}-time-error`
                : undefined
            }
          />
          <p className="mt-1 text-sm text-slate-500">
            Optional. Leave blank if only the date is known.
          </p>
          <FieldError
            id={`${formId}-time-error`}
            messages={state.fieldErrors?.reportedTime}
          />
        </div>
      </div>

      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
        <p className="text-sm font-medium text-slate-700">Notice given</p>
        {notice ? (
          <div className="mt-1 text-sm text-slate-800">
            <p>
              {notice.noticeBasis === "EXACT_TIME" && notice.noticeMinutes != null
                ? formatDurationMinutes(notice.noticeMinutes)
                : formatCalendarNotice(notice.noticeCalendarDays)}
              {" · "}
              {NOTICE_BASIS_LABELS[notice.noticeBasis]}
            </p>
            {notice.isShortNotice ? (
              <p className="mt-1 font-medium text-amber-800">
                Short notice
                {notice.isRetrospective ? " · retrospective / late" : ""}
              </p>
            ) : null}
            {notice.isRetrospective && !notice.isShortNotice ? (
              <p className="mt-1 font-medium text-amber-800">
                Retrospective / late record
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-1 text-sm text-slate-500">
            Select an event and reported date to preview notice.
          </p>
        )}
      </div>

      {notice?.isRetrospective ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3">
          <p className="text-sm text-amber-900">
            This report is after the event date or start time. Negative notice
            will be stored as entered. Confirm if this is a retrospective or
            late record.
          </p>
          <label className="mt-2 flex items-start gap-2 text-sm text-slate-800">
            <input
              type="checkbox"
              name="retrospectiveConfirmed"
              checked={retrospectiveConfirmed}
              onChange={(event) =>
                setRetrospectiveConfirmed(event.target.checked)
              }
              className="mt-1"
            />
            <span>
              I confirm this is a retrospective or late record{" "}
              <span className="text-red-700">*</span>
            </span>
          </label>
          <FieldError
            id={`${formId}-retro-error`}
            messages={state.fieldErrors?.retrospectiveConfirmed}
          />
        </div>
      ) : null}

      <div>
        <label
          htmlFor={`${formId}-reason`}
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          Reason for cancellation <span className="text-red-700">*</span>
        </label>
        <textarea
          id={`${formId}-reason`}
          name="reason"
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={1000}
          aria-invalid={Boolean(state.fieldErrors?.reason)}
          aria-describedby={
            state.fieldErrors?.reason ? `${formId}-reason-error` : undefined
          }
          className={controlClassName("w-full")}
        />
        <FieldError
          id={`${formId}-reason-error`}
          messages={state.fieldErrors?.reason}
        />
      </div>

      <div>
        <label
          htmlFor={`${formId}-notes`}
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          Internal notes
        </label>
        <textarea
          id={`${formId}-notes`}
          name="notes"
          rows={3}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={2000}
          aria-invalid={Boolean(state.fieldErrors?.notes)}
          aria-describedby={
            state.fieldErrors?.notes ? `${formId}-notes-error` : undefined
          }
          className={controlClassName("w-full")}
        />
        <FieldError
          id={`${formId}-notes-error`}
          messages={state.fieldErrors?.notes}
        />
      </div>

      {mode === "edit" ? (
        <div>
          <label
            htmlFor={`${formId}-correction`}
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Correction reason <span className="text-red-700">*</span>
          </label>
          <textarea
            id={`${formId}-correction`}
            name="correctionReason"
            rows={2}
            value={correctionReason}
            onChange={(event) => setCorrectionReason(event.target.value)}
            maxLength={500}
            aria-invalid={Boolean(state.fieldErrors?.correctionReason)}
            aria-describedby={
              state.fieldErrors?.correctionReason
                ? `${formId}-correction-error`
                : undefined
            }
            className={controlClassName("w-full")}
          />
          <FieldError
            id={`${formId}-correction-error`}
            messages={state.fieldErrors?.correctionReason}
          />
        </div>
      ) : (
        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          This Cancellation will be added with follow-up pending. Follow-up will
          be managed from the Cancellation Ledger.
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {pending
            ? "Saving…"
            : mode === "create"
              ? "Save cancellation"
              : "Save correction"}
        </button>
        <Link
          href={mode === "edit" && absenceId ? `/absence/${absenceId}` : "/dashboard"}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
