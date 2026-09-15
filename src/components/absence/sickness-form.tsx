"use client";

import { useActionState, useEffect, useId, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import {
  correctSicknessAction,
  createSicknessAction,
  type AbsenceActionState,
} from "@/app/(app)/absence/actions";
import { AbsenceTypeSelector } from "@/components/absence/absence-type-selector";
import { StaffSearchPicker } from "@/components/absence/staff-search-picker";
import { FieldError, FormAlert, controlClassName } from "@/components/form";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { FieldLabel } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { ISSUE_SUMMARY_MAX_CODE_POINTS } from "@/lib/absence/catalog";
import type { AbsenceStaffOption } from "@/lib/absence/queries";
import {
  parseCorrectSicknessFormData,
  parseSicknessFormData,
} from "@/lib/absence/schema";
import {
  ISSUE_SUMMARY_HELPER_TEXT,
  requiresAdvanceConfirmation,
  requiresCorrectionAdvanceConfirmation,
} from "@/lib/absence/sickness";
import { parseLocalDate } from "@/lib/events/dates";
import { formatStaffName } from "@/lib/staff/display";
import { withClientValidation } from "@/lib/form";

const initialState: AbsenceActionState = {};

export function SicknessForm({
  mode,
  absenceId,
  defaultReportedDate,
  timeZone,
  initialStaff,
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
  cancelHref?: string;
  initialValues?: {
    reportedDate?: string;
    firstWorkingDaySick?: string;
    sicknessStartedDate?: string | null;
    issueSummary?: string | null;
  };
  hideTypeSelector?: boolean;
  onStaffChange?: (staff: AbsenceStaffOption | null) => void;
  expectedUpdatedAt?: string;
}) {
  void timeZone;
  const action = mode === "create" ? createSicknessAction : correctSicknessAction;
  const parse =
    mode === "create" ? parseSicknessFormData : parseCorrectSicknessFormData;
  const validatedAction = useMemo(
    () => withClientValidation(parse, action),
    [action, parse],
  );
  const [state, formAction, pending] = useActionState(
    validatedAction,
    initialState,
  );
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [formKey, setFormKey] = useState(0);
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const [selectedStaff, setSelectedStaff] = useState<AbsenceStaffOption | null>(
    initialStaff ?? null,
  );
  const [reportedDate, setReportedDate] = useState(
    initialValues?.reportedDate ?? defaultReportedDate,
  );
  const [firstWorkingDaySick, setFirstWorkingDaySick] = useState(
    initialValues?.firstWorkingDaySick ?? "",
  );
  const [sicknessStartedDate, setSicknessStartedDate] = useState(
    initialValues?.sicknessStartedDate ?? "",
  );
  const [issueSummary, setIssueSummary] = useState(
    initialValues?.issueSummary ?? "",
  );
  const [correctionReason, setCorrectionReason] = useState("");
  const [advanceConfirmed, setAdvanceConfirmed] = useState(false);

  useEffect(() => {
    if (!state.fieldErrors) {
      return;
    }
    const firstInvalid = formRef.current?.querySelector<HTMLElement>(
      "[aria-invalid='true']",
    );
    firstInvalid?.focus();
  }, [state.fieldErrors]);

  const needsAdvanceConfirmation =
    parseLocalDate(firstWorkingDaySick) != null &&
    (mode === "create"
      ? requiresAdvanceConfirmation(firstWorkingDaySick, defaultReportedDate)
      : requiresCorrectionAdvanceConfirmation({
          previousFirstWorkingDaySickIso:
            initialValues?.firstWorkingDaySick ?? "",
          nextFirstWorkingDaySickIso: firstWorkingDaySick,
          todayIso: defaultReportedDate,
        }));

  function resetCreateForm() {
    setFormKey((value) => value + 1);
    setIdempotencyKey(crypto.randomUUID());
    setSelectedStaff(null);
    onStaffChange?.(null);
    setReportedDate(defaultReportedDate);
    setFirstWorkingDaySick("");
    setSicknessStartedDate("");
    setIssueSummary("");
    setAdvanceConfirmed(false);
  }

  const typeCards = hideTypeSelector ? null : (
    <AbsenceTypeSelector value="SICKNESS" locked />
  );

  const detailsFields = (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor={`${formId}-reported`} required>
            Date sickness reported
          </FieldLabel>
          <input
            id={`${formId}-reported`}
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
                ? `${formId}-reported-error`
                : undefined
            }
            className={controlClassName("w-full")}
          />
          <FieldError
            id={`${formId}-reported-error`}
            messages={state.fieldErrors?.reportedDate}
          />
        </div>
        <div>
          <FieldLabel htmlFor={`${formId}-first-day`} required>
            First day sick from work
          </FieldLabel>
          <input
            id={`${formId}-first-day`}
            name="firstWorkingDaySick"
            type="date"
            value={firstWorkingDaySick}
            onChange={(event) => {
              const next = event.target.value;
              if (next === "" || parseLocalDate(next)) {
                setFirstWorkingDaySick(next);
                setAdvanceConfirmed(false);
              }
            }}
            aria-invalid={Boolean(state.fieldErrors?.firstWorkingDaySick)}
            aria-describedby={
              state.fieldErrors?.firstWorkingDaySick
                ? `${formId}-first-day-error`
                : undefined
            }
            className={controlClassName("w-full")}
          />
          <FieldError
            id={`${formId}-first-day-error`}
            messages={state.fieldErrors?.firstWorkingDaySick}
          />
        </div>
      </div>

      <div>
        <FieldLabel htmlFor={`${formId}-started`}>Sickness started</FieldLabel>
        <input
          id={`${formId}-started`}
          name="sicknessStartedDate"
          type="date"
          value={sicknessStartedDate}
          onChange={(event) => {
            const next = event.target.value;
            if (next === "" || parseLocalDate(next)) {
              setSicknessStartedDate(next);
            }
          }}
          aria-invalid={Boolean(state.fieldErrors?.sicknessStartedDate)}
          aria-describedby={
            state.fieldErrors?.sicknessStartedDate
              ? `${formId}-started-error`
              : undefined
          }
          className={controlClassName("w-full sm:max-w-xs")}
        />
        <FieldError
          id={`${formId}-started-error`}
          messages={state.fieldErrors?.sicknessStartedDate}
        />
      </div>

      {needsAdvanceConfirmation ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3">
          <label className="flex items-start gap-2 text-sm text-slate-800">
            <input
              type="checkbox"
              name="futureFirstWorkingDayConfirmed"
              checked={advanceConfirmed}
              onChange={(event) => setAdvanceConfirmed(event.target.checked)}
              className="mt-1"
              aria-invalid={Boolean(
                state.fieldErrors?.futureFirstWorkingDayConfirmed,
              )}
              aria-describedby={
                state.fieldErrors?.futureFirstWorkingDayConfirmed
                  ? `${formId}-advance-error`
                  : undefined
              }
            />
            <span>
              The staff member reported sickness before their next affected
              working day. <span className="text-red-700">*</span>
            </span>
          </label>
          <FieldError
            id={`${formId}-advance-error`}
            messages={state.fieldErrors?.futureFirstWorkingDayConfirmed}
          />
        </div>
      ) : null}

      <div>
        <FieldLabel htmlFor={`${formId}-summary`}>Issue summary</FieldLabel>
        <textarea
          id={`${formId}-summary`}
          name="issueSummary"
          rows={3}
          value={issueSummary}
          onChange={(event) => setIssueSummary(event.target.value)}
          maxLength={ISSUE_SUMMARY_MAX_CODE_POINTS}
          aria-invalid={Boolean(state.fieldErrors?.issueSummary)}
          aria-describedby={`${formId}-summary-help${
            state.fieldErrors?.issueSummary ? ` ${formId}-summary-error` : ""
          }`}
          className={controlClassName("w-full")}
        />
        <p id={`${formId}-summary-help`} className="mt-1 text-sm text-slate-500">
          {ISSUE_SUMMARY_HELPER_TEXT}
        </p>
        <FieldError
          id={`${formId}-summary-error`}
          messages={state.fieldErrors?.issueSummary}
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
    <form ref={formRef} action={formAction} noValidate className="space-y-6">
      {mode === "edit" && absenceId ? (
        <input type="hidden" name="absenceId" value={absenceId} />
      ) : null}
      {mode === "create" ? (
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      ) : null}
      {mode === "edit" && expectedUpdatedAt ? (
        <input type="hidden" name="expectedUpdatedAt" value={expectedUpdatedAt} />
      ) : null}
      {mode === "edit" && initialValues?.firstWorkingDaySick ? (
        <input
          type="hidden"
          name="previousFirstWorkingDaySick"
          value={initialValues.firstWorkingDaySick}
        />
      ) : null}
      <input type="hidden" name="type" value="SICKNESS" />
      <input type="hidden" name="todayIso" value={defaultReportedDate} />
      <FormAlert>{state.error}</FormAlert>
      {state.existingAbsenceId ? (
        <p className="text-sm text-slate-700">
          <ButtonLink
            href={`/absence/${state.existingAbsenceId}`}
            variant="ghost"
            className="px-0 underline"
          >
            Open the existing record
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
          <FormSection step={typeCards ? 3 : 2} title="Initial report">
            {detailsFields}
          </FormSection>
          <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
            <p className="min-w-0 text-sm text-slate-600">
              <span className="font-medium text-sickness">Sickness</span>
              {selectedStaff ? ` → ${formatStaffName(selectedStaff)}` : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={resetCreateForm}>
                Clear
              </Button>
              <Button type="submit" disabled={pending || !idempotencyKey} icon={Check}>
                {pending ? "Saving…" : "Save sickness report"}
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
            onSelect={(staff) => {
              setSelectedStaff(staff);
              onStaffChange?.(staff);
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
