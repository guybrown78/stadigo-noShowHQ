"use client";

import Link from "next/link";
import { useActionState, useId, useMemo, useState } from "react";
import type {
  EmploymentStatus,
  ProbationDurationSource,
  ProbationStatus,
  SecurityClearanceStatus,
} from "@prisma/client";
import {
  createStaffAction,
  updateStaffAction,
  type StaffActionState,
} from "@/app/(app)/staff/actions";
import { FieldError, FormAlert, controlClassName } from "@/components/form";
import { ManagerPicker } from "@/components/staff/manager-picker";
import {
  formatLocalDateDisplay,
  parseLocalDate,
} from "@/lib/events/dates";
import { withClientValidation } from "@/lib/form";
import {
  EMPLOYMENT_STATUSES,
  SECURITY_CLEARANCE_STATUSES,
  clearanceStatusRequiresExpiry,
} from "@/lib/staff/catalog";
import {
  CLEARANCE_STATUS_LABELS,
  DURATION_SOURCE_LABELS,
  EMPLOYMENT_STATUS_LABELS,
  formatDurationSource,
} from "@/lib/staff/display";
import {
  calculatedProbationEndDate,
  calculatedReviewDueDate,
  effectiveProbationDuration,
} from "@/lib/staff/probation";
import type { ManagerOption } from "@/lib/staff/queries";
import { parseStaffFormData } from "@/lib/staff/schema";

export type StaffFormInitialValues = {
  staffIdNumber?: string;
  firstName?: string;
  lastName?: string;
  email?: string | null;
  phone?: string | null;
  department?: string | null;
  roleTitle?: string;
  managerStaffId?: string | null;
  employmentStatus?: EmploymentStatus;
  startDate?: string | null;
  applyProbation?: boolean;
  probationLengthDays?: number | null;
  overrideProbationEndDate?: boolean;
  probationEndDate?: string | null;
  probationStatus?: ProbationStatus;
  securityClearanceStatus?: SecurityClearanceStatus;
  securityClearanceExpiryDate?: string | null;
  notes?: string | null;
};

export type StaffFormProbationLock = {
  kind: "active" | "completed";
  durationSource: ProbationDurationSource;
  effectiveDurationDays: number | null;
  startDate: string | null;
  currentEndDate: string | null;
  reviewDueDate: string | null;
};

const initialState: StaffActionState = {};

export function StaffForm({
  mode,
  staffId,
  defaultProbationDays,
  initialManager,
  initialValues,
  probationLock,
}: {
  mode: "create" | "edit";
  staffId?: string;
  defaultProbationDays: number;
  initialManager?: ManagerOption | null;
  initialValues?: StaffFormInitialValues;
  probationLock?: StaffFormProbationLock | null;
}) {
  const action = mode === "create" ? createStaffAction : updateStaffAction;
  const validatedAction = useMemo(
    () => withClientValidation(parseStaffFormData, action),
    [action],
  );
  const [state, formAction, pending] = useActionState(
    validatedAction,
    initialState,
  );
  const formId = useId();

  const [applyProbation, setApplyProbation] = useState(
    initialValues?.applyProbation ?? false,
  );
  const [startDate, setStartDate] = useState(initialValues?.startDate ?? "");
  const [durationOverride, setDurationOverride] = useState(
    initialValues?.probationLengthDays
      ? String(initialValues.probationLengthDays)
      : "",
  );
  const [overrideEndDate, setOverrideEndDate] = useState(
    initialValues?.overrideProbationEndDate ?? false,
  );
  const [endDate, setEndDate] = useState(
    initialValues?.probationEndDate ?? "",
  );
  const [clearanceStatus, setClearanceStatus] = useState<SecurityClearanceStatus>(
    initialValues?.securityClearanceStatus ?? "NOT_RECORDED",
  );

  const parsedOverride = durationOverride.trim()
    ? Number(durationOverride)
    : null;
  const duration = effectiveProbationDuration(
    Number.isInteger(parsedOverride) && (parsedOverride ?? 0) > 0
      ? parsedOverride
      : null,
    defaultProbationDays,
  );
  const parsedStart = startDate ? parseLocalDate(startDate) : null;
  const calculatedEnd = parsedStart
    ? calculatedProbationEndDate(parsedStart, duration)
    : null;
  const displayedEnd = overrideEndDate
    ? endDate
      ? parseLocalDate(endDate)
      : null
    : calculatedEnd;
  const reviewDue =
    displayedEnd && applyProbation
      ? calculatedReviewDueDate(displayedEnd)
      : null;
  const sourceLabel = overrideEndDate
    ? DURATION_SOURCE_LABELS.MANUAL_END_DATE
    : parsedOverride
      ? `Individual override, ${parsedOverride} days`
      : `Tenant default, ${defaultProbationDays} days`;
  const locked = Boolean(probationLock);
  const needsExpiry = clearanceStatusRequiresExpiry(clearanceStatus);

  function errorId(name: string) {
    return `${formId}-${name}-error`;
  }

  return (
    <form action={formAction} noValidate className="space-y-6">
      {mode === "edit" && staffId ? (
        <input type="hidden" name="staffId" value={staffId} />
      ) : null}
      <FormAlert>{state.error}</FormAlert>

      <fieldset className="space-y-4">
        <legend className="text-base font-semibold text-slate-900">
          Identity and contact
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor={`${formId}-staff-id`}
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Staff ID <span className="text-red-700">*</span>
            </label>
            <input
              id={`${formId}-staff-id`}
              name="staffIdNumber"
              required
              maxLength={80}
              defaultValue={initialValues?.staffIdNumber ?? ""}
              aria-required="true"
              aria-invalid={Boolean(state.fieldErrors?.staffIdNumber)}
              aria-describedby={
                state.fieldErrors?.staffIdNumber
                  ? errorId("staffId")
                  : undefined
              }
              className={controlClassName("w-full")}
            />
            <FieldError
              id={errorId("staffId")}
              messages={state.fieldErrors?.staffIdNumber}
            />
          </div>
          <div className="hidden sm:block" />
          <div>
            <label
              htmlFor={`${formId}-first-name`}
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              First name <span className="text-red-700">*</span>
            </label>
            <input
              id={`${formId}-first-name`}
              name="firstName"
              required
              maxLength={80}
              defaultValue={initialValues?.firstName ?? ""}
              aria-required="true"
              aria-invalid={Boolean(state.fieldErrors?.firstName)}
              aria-describedby={
                state.fieldErrors?.firstName ? errorId("firstName") : undefined
              }
              className={controlClassName("w-full")}
            />
            <FieldError
              id={errorId("firstName")}
              messages={state.fieldErrors?.firstName}
            />
          </div>
          <div>
            <label
              htmlFor={`${formId}-last-name`}
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Last name <span className="text-red-700">*</span>
            </label>
            <input
              id={`${formId}-last-name`}
              name="lastName"
              required
              maxLength={80}
              defaultValue={initialValues?.lastName ?? ""}
              aria-required="true"
              aria-invalid={Boolean(state.fieldErrors?.lastName)}
              aria-describedby={
                state.fieldErrors?.lastName ? errorId("lastName") : undefined
              }
              className={controlClassName("w-full")}
            />
            <FieldError
              id={errorId("lastName")}
              messages={state.fieldErrors?.lastName}
            />
          </div>
          <div>
            <label
              htmlFor={`${formId}-email`}
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Email
            </label>
            <input
              id={`${formId}-email`}
              name="email"
              type="email"
              maxLength={254}
              defaultValue={initialValues?.email ?? ""}
              aria-invalid={Boolean(state.fieldErrors?.email)}
              aria-describedby={
                state.fieldErrors?.email ? errorId("email") : undefined
              }
              className={controlClassName("w-full")}
            />
            <p className="mt-1 text-sm text-slate-500">
              Operational contact only. This does not create a login.
            </p>
            <FieldError id={errorId("email")} messages={state.fieldErrors?.email} />
          </div>
          <div>
            <label
              htmlFor={`${formId}-phone`}
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Phone
            </label>
            <input
              id={`${formId}-phone`}
              name="phone"
              maxLength={40}
              defaultValue={initialValues?.phone ?? ""}
              aria-invalid={Boolean(state.fieldErrors?.phone)}
              aria-describedby={
                state.fieldErrors?.phone ? errorId("phone") : undefined
              }
              className={controlClassName("w-full")}
            />
            <FieldError id={errorId("phone")} messages={state.fieldErrors?.phone} />
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-4 border-t border-slate-200 pt-6">
        <legend className="text-base font-semibold text-slate-900">
          Operational details
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor={`${formId}-department`}
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Department
            </label>
            <input
              id={`${formId}-department`}
              name="department"
              maxLength={100}
              defaultValue={initialValues?.department ?? ""}
              aria-invalid={Boolean(state.fieldErrors?.department)}
              className={controlClassName("w-full")}
            />
            <FieldError
              id={errorId("department")}
              messages={state.fieldErrors?.department}
            />
          </div>
          <div>
            <label
              htmlFor={`${formId}-role`}
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Role <span className="text-red-700">*</span>
            </label>
            <input
              id={`${formId}-role`}
              name="roleTitle"
              required
              maxLength={120}
              defaultValue={initialValues?.roleTitle ?? ""}
              aria-required="true"
              aria-invalid={Boolean(state.fieldErrors?.roleTitle)}
              aria-describedby={
                state.fieldErrors?.roleTitle ? errorId("role") : undefined
              }
              className={controlClassName("w-full")}
            />
            <FieldError
              id={errorId("role")}
              messages={state.fieldErrors?.roleTitle}
            />
          </div>
          <div className="sm:col-span-2">
            <ManagerPicker
              excludeId={staffId}
              initialManager={initialManager}
              errorId={errorId("manager")}
              errorMessages={state.fieldErrors?.managerStaffId}
            />
          </div>
          <div>
            <label
              htmlFor={`${formId}-status`}
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Employment status <span className="text-red-700">*</span>
            </label>
            <select
              id={`${formId}-status`}
              name="employmentStatus"
              defaultValue={initialValues?.employmentStatus ?? "ACTIVE"}
              aria-required="true"
              aria-invalid={Boolean(state.fieldErrors?.employmentStatus)}
              className={controlClassName("w-full bg-white")}
            >
              {EMPLOYMENT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {EMPLOYMENT_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
            <FieldError
              id={errorId("status")}
              messages={state.fieldErrors?.employmentStatus}
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-4 border-t border-slate-200 pt-6">
        <legend className="text-base font-semibold text-slate-900">
          Start date and probation
        </legend>
        <div>
          <label
            htmlFor={`${formId}-start`}
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Start date
          </label>
          <input
            id={`${formId}-start`}
            name="startDate"
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            aria-invalid={Boolean(state.fieldErrors?.startDate)}
            aria-describedby={
              state.fieldErrors?.startDate ? errorId("start") : undefined
            }
            className={controlClassName("w-full max-w-xs")}
          />
          <FieldError
            id={errorId("start")}
            messages={state.fieldErrors?.startDate}
          />
        </div>
        <div className="flex items-start gap-2">
          {locked ? (
            <>
              <input type="hidden" name="applyProbation" value="on" />
              <input
                type="hidden"
                name="probationStatus"
                value={initialValues?.probationStatus ?? "IN_PROGRESS"}
              />
            </>
          ) : (
            <>
              <input
                id={`${formId}-apply-probation`}
                name="applyProbation"
                type="checkbox"
                checked={applyProbation}
                onChange={(event) => setApplyProbation(event.target.checked)}
                className="mt-1"
              />
              <label
                htmlFor={`${formId}-apply-probation`}
                className="text-sm text-slate-800"
              >
                Apply probation
              </label>
            </>
          )}
        </div>
        {locked && probationLock ? (
          <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <p>
              Effective rule:{" "}
              <span className="font-medium text-slate-900">
                {formatDurationSource(
                  probationLock.durationSource,
                  probationLock.effectiveDurationDays,
                )}
              </span>
              . This snapshot does not change if the organisation default is
              edited later.
            </p>
            <p>
              Start {probationLock.startDate ?? "—"}; end{" "}
              {probationLock.currentEndDate ?? "—"}; review due{" "}
              {probationLock.reviewDueDate ?? "—"}.
            </p>
            {probationLock.kind === "active" && staffId ? (
              <p className="flex flex-wrap gap-3">
                <Link
                  href={`/staff/${staffId}/probation/review`}
                  className="font-medium text-slate-900 underline"
                >
                  Review probation
                </Link>
                <Link
                  href={`/staff/${staffId}/probation/amend`}
                  className="font-medium text-slate-900 underline"
                >
                  Amend end date
                </Link>
              </p>
            ) : (
              <p>
                This probation cycle is complete. Decisions are not edited here.
                Use{" "}
                <Link
                  href={`/staff/${staffId}`}
                  className="font-medium text-slate-900 underline"
                >
                  Start probation again
                </Link>{" "}
                on the staff record if they should go back on probation.
              </p>
            )}
          </div>
        ) : applyProbation ? (
          <div className="space-y-4 rounded-md border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm text-slate-600">
              Effective source:{" "}
              <span className="font-medium text-slate-900">{sourceLabel}</span>
              . This value is stored when you save and will not change if the
              organisation default is edited later.
            </p>
            <div>
              <label
                htmlFor={`${formId}-duration`}
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Individual duration override (days)
              </label>
              <input
                id={`${formId}-duration`}
                name="probationLengthDays"
                type="number"
                inputMode="numeric"
                min={1}
                max={730}
                value={durationOverride}
                onChange={(event) => setDurationOverride(event.target.value)}
                aria-invalid={Boolean(state.fieldErrors?.probationLengthDays)}
                className={controlClassName("w-full max-w-xs bg-white")}
              />
              <p className="mt-1 text-xs text-slate-500">
                Leave blank to use the tenant default of {defaultProbationDays}{" "}
                days.
              </p>
              <FieldError
                id={errorId("duration")}
                messages={state.fieldErrors?.probationLengthDays}
              />
            </div>
            <input type="hidden" name="probationStatus" value="IN_PROGRESS" />
            <p className="text-sm text-slate-700">
              Calculated end date:{" "}
              {calculatedEnd
                ? formatLocalDateDisplay(calculatedEnd)
                : "Enter a start date to calculate"}
            </p>
            <div className="flex items-start gap-2">
              <input
                id={`${formId}-override-end`}
                name="overrideProbationEndDate"
                type="checkbox"
                checked={overrideEndDate}
                onChange={(event) => setOverrideEndDate(event.target.checked)}
                className="mt-1"
              />
              <label
                htmlFor={`${formId}-override-end`}
                className="text-sm text-slate-800"
              >
                Set a different probation end date
              </label>
            </div>
            {overrideEndDate ? (
              <div>
                <label
                  htmlFor={`${formId}-end`}
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Probation end date
                </label>
                <input
                  id={`${formId}-end`}
                  name="probationEndDate"
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  aria-invalid={Boolean(state.fieldErrors?.probationEndDate)}
                  className={controlClassName("w-full max-w-xs bg-white")}
                />
                <FieldError
                  id={errorId("end")}
                  messages={state.fieldErrors?.probationEndDate}
                />
              </div>
            ) : null}
            <p className="text-sm text-slate-600">
              Review due date:{" "}
              {reviewDue
                ? `${formatLocalDateDisplay(reviewDue)} (28 days before the end date)`
                : "Not set"}
            </p>
          </div>
        ) : (
          <input type="hidden" name="probationStatus" value="NOT_APPLICABLE" />
        )}
      </fieldset>

      <fieldset className="space-y-4 border-t border-slate-200 pt-6">
        <legend className="text-base font-semibold text-slate-900">
          Security clearance
        </legend>
        <p className="text-sm text-slate-500">
          This records a status summary only. Clearance documents are not stored
          here.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor={`${formId}-clearance`}
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Clearance status <span className="text-red-700">*</span>
            </label>
            <select
              id={`${formId}-clearance`}
              name="securityClearanceStatus"
              value={clearanceStatus}
              onChange={(event) =>
                setClearanceStatus(
                  event.target.value as SecurityClearanceStatus,
                )
              }
              className={controlClassName("w-full bg-white")}
            >
              {SECURITY_CLEARANCE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {CLEARANCE_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
            <FieldError
              id={errorId("clearance")}
              messages={state.fieldErrors?.securityClearanceStatus}
            />
          </div>
          {needsExpiry ? (
            <div>
              <label
                htmlFor={`${formId}-expiry`}
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Clearance expiry date <span className="text-red-700">*</span>
              </label>
              <input
                id={`${formId}-expiry`}
                name="securityClearanceExpiryDate"
                type="date"
                defaultValue={initialValues?.securityClearanceExpiryDate ?? ""}
                aria-required="true"
                aria-invalid={Boolean(
                  state.fieldErrors?.securityClearanceExpiryDate,
                )}
                className={controlClassName("w-full")}
              />
              <FieldError
                id={errorId("expiry")}
                messages={state.fieldErrors?.securityClearanceExpiryDate}
              />
            </div>
          ) : null}
        </div>
      </fieldset>

      <fieldset className="space-y-4 border-t border-slate-200 pt-6">
        <legend className="text-base font-semibold text-slate-900">Notes</legend>
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
            rows={4}
            maxLength={2000}
            defaultValue={initialValues?.notes ?? ""}
            aria-invalid={Boolean(state.fieldErrors?.notes)}
            className={controlClassName("w-full")}
          />
          <FieldError id={errorId("notes")} messages={state.fieldErrors?.notes} />
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending
          ? mode === "create"
            ? "Creating…"
            : "Saving…"
          : mode === "create"
            ? "Create staff member"
            : "Save changes"}
      </button>
    </form>
  );
}
