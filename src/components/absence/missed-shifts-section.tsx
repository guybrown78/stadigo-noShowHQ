"use client";

import { useActionState, useEffect, useId, useMemo, useState } from "react";
import {
  addMissedShiftAction,
  removeMissedShiftAction,
  type MissedShiftActionState,
} from "@/app/(app)/absence/missed-shift-actions";
import { EventSearchPicker } from "@/components/absence/event-search-picker";
import { FormAlert } from "@/components/form";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { missedShiftWhen } from "@/lib/absence/missed-shift";
import {
  parseAddMissedShiftFormData,
  parseRemoveMissedShiftFormData,
} from "@/lib/absence/missed-shift-schema";
import type { AbsenceDetail } from "@/lib/absence/queries";
import { cn } from "@/lib/cn";
import { withClientValidation } from "@/lib/form";

type MissedShift = AbsenceDetail["missedShifts"][number];

const monthFormat = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function removeQuestion(shift: MissedShift): string {
  const place = [shift.venueNameSnapshot, shift.eventReferenceSnapshot]
    .filter((part) => part && part.trim().length > 0)
    .join(", ");
  const detail = [missedShiftWhen(shift), place].filter(Boolean).join(", ");
  return `Are you sure you want to remove ${shift.eventNameSnapshot}, ${detail}? The sickness record stays.`;
}

function groupShiftsByMonth(shifts: readonly MissedShift[]) {
  const groups: { key: string; label: string; shifts: MissedShift[] }[] = [];
  for (const shift of shifts) {
    const date = shift.eventDateSnapshot;
    const key = `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
    const last = groups[groups.length - 1];
    if (last?.key === key) {
      last.shifts.push(shift);
    } else {
      groups.push({ key, label: monthFormat.format(date), shifts: [shift] });
    }
  }
  return groups;
}

const initialState: MissedShiftActionState = {};

export function MissedShiftsSection({
  absence,
  returnTo,
}: {
  absence: AbsenceDetail;
  returnTo?: string;
}) {
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  if (absence.type !== "SICKNESS" || !absence.sickness) {
    return null;
  }

  const shifts = absence.missedShifts;
  const canMutate = absence.recordStatus === "ACTIVE";
  const showAdd = canMutate && adding;
  const openShift = shifts.find((shift) => shift.id === openId) ?? null;
  const months = groupShiftsByMonth(shifts);

  const addShift =
    canMutate && !showAdd ? (
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={() => {
          setOpenId(null);
          setAdding(true);
        }}
      >
        Add shift
      </Button>
    ) : null;

  return (
    <Card className="mt-6 shadow-none">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-[0.9375rem] font-semibold tracking-[-0.01em] text-foreground">
            Missed shifts
          </h2>
          {shifts.length === 0 ? (
            <p className="mt-1 text-sm text-muted">No booked shifts recorded.</p>
          ) : (
            <p className="mt-1 flex items-baseline gap-2 text-sm font-medium text-foreground">
              <span className="text-[1.75rem] font-semibold tabular-nums leading-none tracking-[-0.03em] text-sickness">
                {shifts.length}
              </span>
              {shifts.length === 1 ? "missed shift" : "missed shifts"}
            </p>
          )}
        </div>
        {addShift}
      </div>
      <CardBody>
        {shifts.length === 0 && !showAdd ? (
          <p className="text-sm text-muted">
            Add each shift this person was booked to work. Days with no booking
            are left out.
          </p>
        ) : null}
        {shifts.length > 0 ? (
          <div className="space-y-4">
            {months.map((month) => (
              <div key={month.key}>
                {months.length > 1 ? (
                  <p className="mb-2 text-sm font-medium text-foreground">
                    {month.label}
                  </p>
                ) : null}
                <ul
                  className={cn(
                    "grid gap-2",
                    shifts.length === 1 ? "grid-cols-1" : "grid-cols-2",
                  )}
                >
                  {month.shifts.map((shift) => {
                    const open = shift.id === openShift?.id;
                    return (
                      <li key={shift.id} className="relative min-w-0">
                        <div
                          className={cn(
                            "rounded-md border px-3 py-2",
                            canMutate ? "pr-8" : "",
                            open
                              ? "border-sickness bg-sickness-soft"
                              : "border-border bg-surface",
                          )}
                        >
                          <span className="block text-sm font-semibold tabular-nums leading-tight text-foreground">
                            {missedShiftWhen(shift)}
                          </span>
                          <span className="mt-0.5 block truncate text-sm leading-tight text-muted">
                            {shift.eventNameSnapshot}
                          </span>
                        </div>
                        {canMutate ? (
                          <button
                            type="button"
                            aria-label={`Remove ${shift.eventNameSnapshot}`}
                            aria-expanded={open}
                            aria-controls={
                              open ? `missed-shift-${shift.id}` : undefined
                            }
                            onClick={() => {
                              setAdding(false);
                              setOpenId(open ? null : shift.id);
                            }}
                            className="absolute right-1 top-1 flex size-6 items-center justify-center rounded text-sm leading-none text-muted hover:bg-wash hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sickness"
                          >
                            <span aria-hidden="true">×</span>
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
                {canMutate &&
                openShift &&
                month.shifts.some((shift) => shift.id === openShift.id) ? (
                  <RemoveShiftForm
                    key={openShift.id}
                    absenceId={absence.id}
                    shiftId={openShift.id}
                    question={removeQuestion(openShift)}
                    returnTo={returnTo}
                    onCancel={() => setOpenId(null)}
                  />
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
        {showAdd ? (
          <AddShiftForm
            absenceId={absence.id}
            returnTo={returnTo}
            takenEventIds={shifts.map((shift) => shift.eventId)}
            onCancel={() => setAdding(false)}
          />
        ) : null}
      </CardBody>
    </Card>
  );
}

function AddShiftForm({
  absenceId,
  returnTo,
  takenEventIds,
  onCancel,
}: {
  absenceId: string;
  returnTo?: string;
  takenEventIds: readonly string[];
  onCancel: () => void;
}) {
  const formId = useId();
  const validatedAction = useMemo(
    () => withClientValidation(parseAddMissedShiftFormData, addMissedShiftAction),
    [],
  );
  const [state, formAction, pending] = useActionState(
    validatedAction,
    initialState,
  );
  const [idempotencyKey, setIdempotencyKey] = useState("");
  useEffect(() => {
    setIdempotencyKey(crypto.randomUUID());
  }, []);

  return (
    <form action={formAction} noValidate className="mt-4 border-t border-border pt-4">
      <input type="hidden" name="absenceId" value={absenceId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      <EventSearchPicker
        label="Booked shift"
        errorId={`${formId}-event-error`}
        errorMessages={state.fieldErrors?.eventId}
        unavailableEventIds={takenEventIds}
      />
      <FormAlert>{state.error}</FormAlert>
      {state.existingAbsenceId ? (
        <p className="mt-2 text-sm">
          <ButtonLink
            href={`/absence/${state.existingAbsenceId}`}
            variant="ghost"
            className="px-0 underline"
          >
            Open the existing record
          </ButtonLink>
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          {pending ? "Adding shift…" : "Add this shift"}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function RemoveShiftForm({
  absenceId,
  shiftId,
  question,
  returnTo,
  onCancel,
}: {
  absenceId: string;
  shiftId: string;
  question: string;
  returnTo?: string;
  onCancel: () => void;
}) {
  const validatedAction = useMemo(
    () =>
      withClientValidation(parseRemoveMissedShiftFormData, removeMissedShiftAction),
    [],
  );
  const [state, formAction, pending] = useActionState(
    validatedAction,
    initialState,
  );
  const [idempotencyKey, setIdempotencyKey] = useState("");
  useEffect(() => {
    setIdempotencyKey(crypto.randomUUID());
  }, []);

  return (
    <form
      id={`missed-shift-${shiftId}`}
      action={formAction}
      noValidate
      className="mt-2 rounded-md border border-border bg-wash p-3"
    >
      <input type="hidden" name="absenceId" value={absenceId} />
      <input type="hidden" name="shiftId" value={shiftId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      <p className="text-sm text-foreground">{question}</p>
      <FormAlert>{state.error}</FormAlert>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="submit" variant="danger" size="sm" disabled={pending}>
          {pending ? "Removing shift…" : "Remove shift"}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          Keep shift
        </Button>
      </div>
    </form>
  );
}
