"use client";

import { useActionState, useEffect, useId, useMemo, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import {
  openPayPeriodAction,
  startNextPayPeriodAction,
  updateOpenPayPeriodAction,
  type PayPeriodActionState,
} from "@/app/(app)/settings/pay-period-actions";
import { FieldError, FormAlert, controlClassName } from "@/components/form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { FieldLabel } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import {
  PAY_PERIOD_LENGTHS,
  payPeriodEndOn,
  payPeriodLabel,
  type PayPeriodLengthId,
} from "@/lib/absence/pay-period";
import { parsePayPeriodDatesFormData } from "@/lib/absence/pay-period-schema";
import { withClientValidation } from "@/lib/form";
import { formatLocalDateDisplay, parseLocalDate } from "@/lib/events/dates";

const initialState: PayPeriodActionState = {};

export function PayPeriodSettingsForms({
  openPeriod,
  upcomingCount = 0,
}: {
  openPeriod: {
    startsOn: string;
    endsOn: string;
    number: number;
    label: string;
    absenceCount: number;
  } | null;
  upcomingCount?: number;
}) {
  if (!openPeriod) {
    return (
      <Card className="mt-8 shadow-none">
        <CardBody className="p-6">
          <PeriodDateForm
            action={openPayPeriodAction}
            idPrefix="open-pay-period"
            submitLabel="Open pay period"
            heading="Open a pay period"
            description="Choose the start and end dates. The name is taken from those dates."
            suggestLengths
          />
        </CardBody>
      </Card>
    );
  }

  return <CurrentPeriod period={openPeriod} upcomingCount={upcomingCount} />;
}

function CurrentPeriod({
  period,
  upcomingCount,
}: {
  period: {
    startsOn: string;
    endsOn: string;
    number: number;
    label: string;
    absenceCount: number;
  };
  upcomingCount: number;
}) {
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const addHeadingId = useId();
  const records =
    period.absenceCount === 1 ? "1 record" : `${period.absenceCount} records`;

  return (
    <Card className="mt-8 shadow-none">
      <CardBody className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-slate-500">
                Period {period.number}
              </p>
              <Badge tone="success">Current</Badge>
            </div>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
              {period.label}
            </h2>
          </div>
          <Button
            type="button"
            variant="secondary"
            icon={Plus}
            data-ledger-view="add-pay-period"
            onClick={() => setAdding(true)}
          >
            Add a period
          </Button>
        </div>

        <dl className="mt-6 grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-slate-500">Dates</dt>
            <dd className="mt-1 font-medium text-slate-900">
              {displayDate(period.startsOn)} to {displayDate(period.endsOn)}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-slate-500">Records</dt>
            <dd className="mt-1 font-medium text-slate-900">{records}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-500">New absences</dt>
            <dd className="mt-1 font-medium text-slate-900">Filed in this period</dd>
          </div>
        </dl>

        <div className="mt-6 border-t border-border pt-5">
          {editing ? (
            <div className="rounded-lg bg-slate-50 p-4">
              <PeriodDateForm
                key={`${period.number}-${period.startsOn}-${period.endsOn}`}
                action={updateOpenPayPeriodAction}
                idPrefix="edit-pay-period"
                submitLabel="Save dates"
                heading="Edit dates"
                description="These dates can be changed while this period is current. The name is taken from the dates."
                startsOn={period.startsOn}
                endsOn={period.endsOn}
                onCancel={() => setEditing(false)}
                onSaved={() => setEditing(false)}
              />
            </div>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              icon={Pencil}
              onClick={() => setEditing(true)}
            >
              Edit dates
            </Button>
          )}
        </div>
      </CardBody>

      <Sheet
        open={adding}
        labelledBy={addHeadingId}
        closeHref="/settings/pay-periods"
        returnFocusId="add-pay-period"
        onClose={() => setAdding(false)}
      >
        <PeriodDateForm
          key={`add-${period.number}-${upcomingCount}`}
          action={startNextPayPeriodAction}
          idPrefix="next-pay-period"
          submitLabel="Add period"
          headingId={addHeadingId}
          heading="Add a period"
          description="Line up the next dates. The new period must start after the current one ends and must not overlap another period. This period stays current until the next one starts."
          suggestLengths
          onSaved={() => setAdding(false)}
        />
      </Sheet>
    </Card>
  );
}

function PeriodDateForm({
  action,
  idPrefix,
  submitLabel,
  heading,
  headingId,
  description,
  startsOn = "",
  endsOn = "",
  suggestLengths = false,
  onCancel,
  onSaved,
}: {
  action: (
    prev: PayPeriodActionState,
    formData: FormData,
  ) => Promise<PayPeriodActionState>;
  idPrefix: string;
  submitLabel: string;
  heading: string;
  headingId?: string;
  description: string;
  startsOn?: string;
  endsOn?: string;
  suggestLengths?: boolean;
  onCancel?: () => void;
  onSaved?: () => void;
}) {
  const validated = useMemo(
    () => withClientValidation(parsePayPeriodDatesFormData, action),
    [action],
  );
  const [state, formAction, pending] = useActionState(validated, initialState);
  const [start, setStart] = useState(startsOn);
  const [end, setEnd] = useState(endsOn);
  const [lengthChoice, setLengthChoice] = useState<PayPeriodLengthId | null>(null);
  const label = payPeriodLabel(start, end);
  const startReady = Boolean(parseLocalDate(start));
  const startMessages = state.fieldErrors?.startsOn;
  const endMessages = state.fieldErrors?.endsOn;

  useEffect(() => {
    if (state.ok) onSaved?.();
  }, [onSaved, state.ok]);

  function changeStart(value: string) {
    const next = suggestLengths
      ? changeStartDate(value, { start, end, lengthChoice })
      : { end, lengthChoice };
    setStart(value);
    setEnd(next.end);
    setLengthChoice(next.lengthChoice);
  }

  function applyLength(id: PayPeriodLengthId) {
    if (!parseLocalDate(start)) return;
    setLengthChoice(id);
    setEnd(payPeriodEndOn(start, id) ?? end);
  }

  return (
    <form action={formAction} className="grid max-w-xl gap-4" noValidate>
      <div>
        <h3 id={headingId} className="text-base font-semibold text-slate-900">
          {heading}
        </h3>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
      </div>
      <FormAlert>{state.error}</FormAlert>
      <div>
        <FieldLabel htmlFor={`${idPrefix}-start`} required>
          Start date
        </FieldLabel>
        <input
          id={`${idPrefix}-start`}
          name="startsOn"
          type="date"
          value={start}
          onChange={(event) => changeStart(event.target.value)}
          aria-invalid={Boolean(startMessages?.length)}
          aria-describedby={startMessages?.length ? `${idPrefix}-start-error` : undefined}
          className={controlClassName("w-full")}
        />
        <FieldError id={`${idPrefix}-start-error`} messages={startMessages} />
      </div>
      {suggestLengths ? (
        <div>
          <p id={`${idPrefix}-lengths`} className="text-sm text-slate-600">
            End date from the start date
          </p>
          <div
            className="mt-2 flex flex-wrap gap-2"
            role="group"
            aria-labelledby={`${idPrefix}-lengths`}
          >
            {PAY_PERIOD_LENGTHS.map((length) => (
              <Button
                key={length.id}
                type="button"
                size="sm"
                variant="secondary"
                disabled={!startReady || pending}
                aria-pressed={lengthChoice === length.id}
                className={
                  lengthChoice === length.id
                    ? "border-primary bg-primary-soft text-primary-hover"
                    : undefined
                }
                onClick={() => applyLength(length.id)}
              >
                {length.label}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
      <div>
        <FieldLabel htmlFor={`${idPrefix}-end`} required>
          End date
        </FieldLabel>
        <input
          id={`${idPrefix}-end`}
          name="endsOn"
          type="date"
          value={end}
          onChange={(event) => {
            setLengthChoice(null);
            setEnd(event.target.value);
          }}
          aria-invalid={Boolean(endMessages?.length)}
          aria-describedby={endMessages?.length ? `${idPrefix}-end-error` : undefined}
          className={controlClassName("w-full")}
        />
        <FieldError id={`${idPrefix}-end-error`} messages={endMessages} />
      </div>
      <p className="text-sm text-slate-600">
        Name:{" "}
        <span className="font-medium text-slate-900">
          {label ?? "Enter both dates to see the name."}
        </span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function changeStartDate(
  nextStart: string,
  current: { start: string; end: string; lengthChoice: PayPeriodLengthId | null },
): { end: string; lengthChoice: PayPeriodLengthId | null } {
  if (!parseLocalDate(nextStart)) {
    return { end: current.end, lengthChoice: current.lengthChoice };
  }
  if (current.lengthChoice) {
    return {
      end: payPeriodEndOn(nextStart, current.lengthChoice) ?? current.end,
      lengthChoice: current.lengthChoice,
    };
  }
  if (!current.end || current.end < nextStart) {
    return { end: payPeriodEndOn(nextStart, "7") ?? current.end, lengthChoice: "7" };
  }
  return { end: current.end, lengthChoice: null };
}

function displayDate(iso: string): string {
  const date = parseLocalDate(iso);
  return date ? formatLocalDateDisplay(date) : iso;
}
