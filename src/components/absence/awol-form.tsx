"use client";

import { useActionState, useEffect, useId, useMemo, useState } from "react";
import { Check } from "lucide-react";
import {
  correctAwolAction,
  createAwolAction,
  type AbsenceActionState,
} from "@/app/(app)/absence/actions";
import { AbsenceTypeSelector } from "@/components/absence/absence-type-selector";
import { EventSearchPicker } from "@/components/absence/event-search-picker";
import { StaffSearchPicker } from "@/components/absence/staff-search-picker";
import { FieldError, FormAlert, controlClassName } from "@/components/form";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { FieldLabel } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import {
  previewAwolEventEligibility,
  requiresSameDayUnknownStartConfirmation,
} from "@/lib/absence/eligibility";
import type { AbsenceEventOption, AbsenceStaffOption } from "@/lib/absence/queries";
import {
  parseAwolFormData,
  parseCorrectAwolFormData,
} from "@/lib/absence/schema";
import { formatLocalDateDisplay, parseLocalDate } from "@/lib/events/dates";
import { formatStaffName } from "@/lib/staff/display";
import { withClientValidation } from "@/lib/form";

const initialState: AbsenceActionState = {};

export function AwolForm({
  mode,
  absenceId,
  defaultReportedDate,
  timeZone,
  initialStaff,
  initialEvent,
  cancelHref,
  initialValues,
  hideTypeSelector = false,
  onStaffChange,
  expectedUpdatedAt,
}: {
  mode: "create" | "edit";
  absenceId?: string;
  defaultReportedDate: string;
  timeZone: string;
  initialStaff?: AbsenceStaffOption | null;
  initialEvent?: AbsenceEventOption | null;
  cancelHref?: string;
  initialValues?: {
    reportedDate?: string;
    notes?: string | null;
    sameDayStartUnknownConfirmed?: boolean;
  };
  hideTypeSelector?: boolean;
  onStaffChange?: (staff: AbsenceStaffOption | null) => void;
  expectedUpdatedAt?: string;
}) {
  const action = mode === "create" ? createAwolAction : correctAwolAction;
  const parse = mode === "create" ? parseAwolFormData : parseCorrectAwolFormData;
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
  const [idempotencyKey, setIdempotencyKey] = useState("");
  useEffect(() => {
    setIdempotencyKey(crypto.randomUUID());
  }, []);
  const [selectedStaff, setSelectedStaff] = useState<AbsenceStaffOption | null>(
    initialStaff ?? null,
  );
  const [selectedEvent, setSelectedEvent] = useState<AbsenceEventOption | null>(
    initialEvent ?? null,
  );
  const [reportedDate, setReportedDate] = useState(
    initialValues?.reportedDate ?? defaultReportedDate,
  );
  const [notes, setNotes] = useState(initialValues?.notes ?? "");
  const [correctionReason, setCorrectionReason] = useState("");
  const [sameDayConfirmed, setSameDayConfirmed] = useState(
    initialValues?.sameDayStartUnknownConfirmed ?? false,
  );

  const eligibility = previewAwolEventEligibility({
    eventDate: selectedEvent?.eventDate,
    eventStartTime: selectedEvent?.startTime,
    sameDayStartUnknownConfirmed: sameDayConfirmed,
    timeZone,
  });
  const needsConfirmation = selectedEvent
    ? requiresSameDayUnknownStartConfirmation({
        eventDate: selectedEvent.eventDate,
        eventStartTime: selectedEvent.startTime,
        timeZone,
      })
    : false;

  function resetCreateForm() {
    setFormKey((value) => value + 1);
    setIdempotencyKey(crypto.randomUUID());
    setSelectedStaff(initialStaff ?? null);
    setSelectedEvent(null);
    setReportedDate(defaultReportedDate);
    setNotes("");
    setSameDayConfirmed(false);
  }

  const typeCards = hideTypeSelector ? null : (
    <AbsenceTypeSelector value="AWOL" locked />
  );

  const eventDate = selectedEvent
    ? parseLocalDate(selectedEvent.eventDate)
    : null;

  const detailsFields = (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1 block text-sm font-medium text-slate-700">
            Event date
          </p>
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-800">
            {eventDate ? formatLocalDateDisplay(eventDate) : "Select an event"}
          </p>
        </div>
        <div>
          <FieldLabel htmlFor={`${formId}-date`} required>
            Date recorded
          </FieldLabel>
          <input
            id={`${formId}-date`}
            name="reportedDate"
            type="date"
            value={reportedDate}
            onChange={(event) => {
              const next = event.target.value;
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
          <p className="mt-1 text-sm text-slate-500">
            The local date this AWOL was entered or confirmed.
          </p>
          <FieldError
            id={`${formId}-date-error`}
            messages={state.fieldErrors?.reportedDate}
          />
        </div>
      </div>

      {eligibility && !eligibility.ok && eligibility.field === "eventId" ? (
        <p
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900"
          role="status"
        >
          {eligibility.message}
        </p>
      ) : null}

      {needsConfirmation ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3">
          <p className="text-sm text-amber-900">
            This Event is today and has no start time. Confirm that the staff
            member was expected and failed to attend.
          </p>
          <label className="mt-2 flex items-start gap-2 text-sm text-slate-800">
            <input
              type="checkbox"
              name="sameDayStartUnknownConfirmed"
              checked={sameDayConfirmed}
              onChange={(event) => setSameDayConfirmed(event.target.checked)}
              className="mt-1"
              aria-invalid={Boolean(
                state.fieldErrors?.sameDayStartUnknownConfirmed,
              )}
              aria-describedby={
                state.fieldErrors?.sameDayStartUnknownConfirmed
                  ? `${formId}-confirm-error`
                  : undefined
              }
            />
            <span>
              I confirm the staff member was expected and has failed to attend
              this Event <span className="text-red-700">*</span>
            </span>
          </label>
          <FieldError
            id={`${formId}-confirm-error`}
            messages={state.fieldErrors?.sameDayStartUnknownConfirmed}
          />
        </div>
      ) : null}

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
        <p className="mt-1 text-sm text-slate-500">Optional. Maximum 2,000 characters.</p>
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
      {mode === "create" ? (
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      ) : null}
      {mode === "edit" && expectedUpdatedAt ? (
        <input type="hidden" name="expectedUpdatedAt" value={expectedUpdatedAt} />
      ) : null}
      <input type="hidden" name="type" value="AWOL" />
      <FormAlert>{state.error}</FormAlert>
      {state.existingAbsenceId ? (
        <p className="text-sm text-slate-700">
          <ButtonLink
            href={`/absence/${state.existingAbsenceId}`}
            variant="ghost"
            className="px-0 underline"
          >
            View the existing absence
          </ButtonLink>
        </p>
      ) : null}

      {mode === "create" ? (
        <>
          {typeCards ? (
            <FormSection step={1} title="What type of absence?">
              {typeCards}
            </FormSection>
          ) : null}
          <FormSection step={typeCards ? 2 : 1} title="Select staff">
            <StaffSearchPicker
              key={`staff-${formKey}`}
              initialStaff={selectedStaff}
              errorId={`${formId}-staff-error`}
              errorMessages={state.fieldErrors?.staffId}
              onSelect={(staff) => {
                setSelectedStaff(staff);
                onStaffChange?.(staff);
              }}
            />
          </FormSection>
          <FormSection step={typeCards ? 3 : 2} title="Select event">
            <EventSearchPicker
              key={`event-${formKey}`}
              initialEvent={selectedEvent}
              searchMode="awol"
              errorId={`${formId}-event-error`}
              errorMessages={state.fieldErrors?.eventId}
              onSelect={(event) => {
                setSelectedEvent(event);
                setSameDayConfirmed(false);
              }}
            />
          </FormSection>
          <FormSection step={typeCards ? 4 : 3} title="Date recorded and notes">
            {detailsFields}
          </FormSection>
          <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
            <p className="min-w-0 text-sm text-slate-600">
              <span className="font-medium text-awol">AWOL</span>
              {selectedStaff ? ` → ${formatStaffName(selectedStaff)}` : ""}
              {selectedEvent ? ` → ${selectedEvent.name}` : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={resetCreateForm}>
                Clear
              </Button>
              <Button type="submit" disabled={pending || !idempotencyKey} icon={Check}>
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
            searchMode="awol"
            errorId={`${formId}-event-error`}
            errorMessages={state.fieldErrors?.eventId}
            onSelect={(event) => {
              setSelectedEvent(event);
              setSameDayConfirmed(false);
            }}
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
