"use client";

import { useActionState, useId, useMemo, useState } from "react";
import { Ban, Bed, Check, UserX } from "lucide-react";
import {
  correctCancellationAction,
  createCancellationAction,
  type AbsenceActionState,
} from "@/app/(app)/absence/actions";
import { EventSearchPicker } from "@/components/absence/event-search-picker";
import { StaffSearchPicker } from "@/components/absence/staff-search-picker";
import { FieldError, FormAlert, controlClassName } from "@/components/form";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { FieldLabel } from "@/components/ui/field";
import { cn } from "@/lib/cn";
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
import { formatStaffName } from "@/lib/staff/display";
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
  cancelHref,
  initialValues,
}: {
  mode: "create" | "edit";
  absenceId?: string;
  defaultReportedDate: string;
  initialStaff?: AbsenceStaffOption | null;
  initialEvent?: AbsenceEventOption | null;
  cancelHref?: string;
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
  const [formKey, setFormKey] = useState(0);
  const [selectedStaff, setSelectedStaff] = useState<AbsenceStaffOption | null>(
    initialStaff ?? null,
  );
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

  function resetCreateForm() {
    setFormKey((value) => value + 1);
    setSelectedStaff(initialStaff ?? null);
    setSelectedEvent(null);
    setReportedDate(defaultReportedDate ?? londonTodayIso());
    setReportedTime("");
    setReason("");
    setNotes("");
    setRetrospectiveConfirmed(false);
  }

  const typeCards = (
    <fieldset>
      <legend className="sr-only">Absence type</legend>
      <div className="grid gap-3 sm:grid-cols-3">
        <p className="rounded-xl border-2 border-cancel bg-cancel-soft px-4 py-4">
          <span className="flex items-center gap-2 text-sm font-semibold text-cancel">
            <Ban className="size-4" aria-hidden="true" />
            Cancellation
          </span>
          <span className="mt-1 block text-xs text-slate-600">
            Staff notified before or after the event
          </span>
        </p>
        <p
          className="rounded-xl border border-border bg-slate-50 px-4 py-4 text-slate-400"
          aria-disabled="true"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <UserX className="size-4" aria-hidden="true" />
            No-Show (AWOL)
          </span>
          <span className="mt-1 block text-xs">Coming soon</span>
        </p>
        <p
          className="rounded-xl border border-border bg-slate-50 px-4 py-4 text-slate-400"
          aria-disabled="true"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Bed className="size-4" aria-hidden="true" />
            Sickness
          </span>
          <span className="mt-1 block text-xs">Coming soon</span>
        </p>
      </div>
      <p className="mt-3 text-sm text-slate-600">
        A cancellation means the staff member notified the organisation before
        the event. You can still record a late or retrospective cancellation
        when notice arrived after the event.
      </p>
    </fieldset>
  );

  const detailsFields = (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor={`${formId}-date`} required>
            Cancellation reported date
          </FieldLabel>
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
        <FieldLabel htmlFor={`${formId}-reason`} required>
          Reason for cancellation
        </FieldLabel>
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
        <FieldLabel htmlFor={`${formId}-notes`}>Internal notes</FieldLabel>
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
          <FieldLabel htmlFor={`${formId}-correction`} required>
            Correction reason
          </FieldLabel>
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
      ) : null}
    </>
  );

  const cancelTarget =
    mode === "edit" && absenceId
      ? `/absence/${absenceId}`
      : (cancelHref ?? "/dashboard");

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
          <ButtonLink
            href={`/absence/${state.existingAbsenceId}`}
            variant="ghost"
            className="px-0 underline"
          >
            View the existing cancellation
          </ButtonLink>
        </p>
      ) : null}

      {mode === "create" ? (
        <>
          <FormSection step={1} title="What type of absence?">
            {typeCards}
          </FormSection>
          <FormSection step={2} title="Select staff">
            <StaffSearchPicker
              key={`staff-${formKey}`}
              initialStaff={selectedStaff}
              errorId={`${formId}-staff-error`}
              errorMessages={state.fieldErrors?.staffId}
              onSelect={setSelectedStaff}
            />
          </FormSection>
          <FormSection step={3} title="Select event">
            <EventSearchPicker
              key={`event-${formKey}`}
              initialEvent={selectedEvent}
              errorId={`${formId}-event-error`}
              errorMessages={state.fieldErrors?.eventId}
              onSelect={setSelectedEvent}
            />
          </FormSection>
          <FormSection step={4} title="Notes and notice">
            {detailsFields}
          </FormSection>
          <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
            <p className="min-w-0 text-sm text-slate-600">
              <span className="font-medium text-cancel">Cancellation</span>
              {selectedStaff ? ` → ${formatStaffName(selectedStaff)}` : ""}
              {selectedEvent ? ` → ${selectedEvent.name}` : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={resetCreateForm}>
                Clear
              </Button>
              <Button type="submit" disabled={pending} icon={Check}>
                {pending ? "Saving…" : "Save absence"}
              </Button>
            </div>
          </div>
        </>
      ) : (
        <>
          {typeCards}
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
          {detailsFields}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={pending} icon={Check}>
              {pending ? "Saving…" : "Save correction"}
            </Button>
            <ButtonLink href={cancelTarget} variant="secondary">
              Cancel
            </ButtonLink>
          </div>
        </>
      )}
    </form>
  );
}

function FormSection({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="shadow-none">
      <CardBody className="space-y-4">
        <h2 className={cn("text-xs font-semibold tracking-wider text-slate-500 uppercase")}>
          {step} — {title}
        </h2>
        {children}
      </CardBody>
    </Card>
  );
}
