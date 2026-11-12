"use client";

import { useState } from "react";
import { EventSearchPicker } from "@/components/absence/event-search-picker";
import { FieldError } from "@/components/form";
import { Button } from "@/components/ui/button";
import {
  MISSED_SHIFT_DUPLICATE_MESSAGE,
  missedShiftCountLabel,
} from "@/lib/absence/missed-shift";
import type { AbsenceEventOption } from "@/lib/absence/queries";
import { formatLocalDateDisplay, parseLocalDate } from "@/lib/events/dates";

function shiftWhen(event: AbsenceEventOption): string {
  const date = parseLocalDate(event.eventDate);
  const shown = date ? formatLocalDateDisplay(date) : event.eventDate;
  return event.startTime ? `${shown} · ${event.startTime}` : shown;
}

export function MissedShiftDraft({
  shifts,
  onChange,
  errorId,
  errorMessages,
}: {
  shifts: AbsenceEventOption[];
  onChange: (shifts: AbsenceEventOption[]) => void;
  errorId: string;
  errorMessages?: string[];
}) {
  const [pickerKey, setPickerKey] = useState(0);
  const [duplicate, setDuplicate] = useState(false);

  function add(event: AbsenceEventOption | null) {
    if (!event) {
      return;
    }
    if (shifts.some((shift) => shift.id === event.id)) {
      setDuplicate(true);
      setPickerKey((value) => value + 1);
      return;
    }
    setDuplicate(false);
    onChange([...shifts, event]);
    setPickerKey((value) => value + 1);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Optional. Add each shift they were booked to work. Days with no booking
        are left out.
      </p>
      {shifts.length > 0 ? (
        <>
          <p className="text-sm font-medium text-foreground">
            {missedShiftCountLabel(shifts.length)}
          </p>
          <ul className="divide-y divide-border">
            {shifts.map((shift) => (
              <li key={shift.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{shiftWhen(shift)}</p>
                    <p className="mt-1 break-words text-sm text-foreground">
                      {shift.name}
                    </p>
                    <p className="text-sm text-muted">
                      {shift.venueName}
                      {shift.reference ? ` · ${shift.reference}` : ""}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={() =>
                      onChange(shifts.filter((item) => item.id !== shift.id))
                    }
                  >
                    Remove
                  </Button>
                </div>
                <input type="hidden" name="missedShiftEventId" value={shift.id} />
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <EventSearchPicker
        key={pickerKey}
        label="Booked shift"
        required={false}
        errorId={`${errorId}-search`}
        onSelect={add}
        submitSelection={false}
        unavailableEventIds={shifts.map((shift) => shift.id)}
      />
      {duplicate ? (
        <p className="text-sm text-red-700">{MISSED_SHIFT_DUPLICATE_MESSAGE}</p>
      ) : null}
      <FieldError id={errorId} messages={errorMessages} />
    </div>
  );
}
