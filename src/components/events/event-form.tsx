"use client";

import { useActionState, useId, useMemo, useState } from "react";
import Link from "next/link";
import type { EventStatus } from "@prisma/client";
import {
  createEventAction,
  updateEventAction,
  type EventActionState,
} from "@/app/(app)/events/actions";
import { FieldError, FormAlert, controlClassName } from "@/components/form";
import {
  DEFAULT_CRITICAL_FILL_RATE,
  DEFAULT_WARNING_FILL_RATE,
  EVENT_STATUSES,
} from "@/lib/events/catalog";
import { EVENT_STATUS_LABELS } from "@/lib/events/display";
import {
  hourOptions,
  isTimeBefore,
  joinTime,
  minuteOptions,
  splitTime,
} from "@/lib/events/dates";
import { parseEventFormData } from "@/lib/events/schema";
import { withClientValidation } from "@/lib/form";

export type EventFormTypeOption = {
  id: string;
  name: string;
  subtypes: { id: string; name: string }[];
};

export type EventFormVenueOption = {
  id: string;
  name: string;
  postcode: string | null;
};

export type EventFormInitialValues = {
  name?: string;
  reference?: string | null;
  eventTypeId?: string;
  eventSubtypeId?: string;
  venueId?: string;
  eventDate?: string;
  briefingTime?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  endsNextDay?: boolean;
  staffRequired?: number;
  warningFillRate?: number;
  criticalFillRate?: number;
  status?: EventStatus;
  notes?: string | null;
};

function HourMinuteFields({
  id,
  name,
  value,
  onChange,
  isTimeDisabled,
  describedBy,
  labelledBy,
  invalid,
}: {
  id: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  isTimeDisabled?: (time: string) => boolean;
  describedBy?: string;
  labelledBy?: string;
  invalid?: boolean;
}) {
  const { hour, minute } = splitTime(value);
  const hours = hourOptions();
  const minutes = minuteOptions(value);
  const selectClass = controlClassName(
    "min-w-[4.5rem] bg-white disabled:bg-slate-50 disabled:text-slate-500",
  );

  function commit(nextHour: string, nextMinute: string) {
    onChange(joinTime(nextHour, nextMinute));
  }

  return (
    <div
      className="flex items-center gap-2"
      role="group"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
    >
      <input type="hidden" name={name} value={value} />
      <div>
        <label htmlFor={`${id}-hour`} className="sr-only">
          Hour
        </label>
        <select
          id={`${id}-hour`}
          value={hour}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          onChange={(event) => commit(event.target.value, minute)}
          className={selectClass}
        >
          <option value="">Hour</option>
          {hours.map((option) => {
            const hourBlocked = minutes.every((mins) =>
              isTimeDisabled?.(`${option}:${mins}`),
            );
            return (
              <option key={option} value={option} disabled={hourBlocked}>
                {option}
              </option>
            );
          })}
        </select>
      </div>
      <span aria-hidden="true" className="text-slate-500">
        :
      </span>
      <div>
        <label htmlFor={`${id}-minute`} className="sr-only">
          Minutes
        </label>
        <select
          id={`${id}-minute`}
          value={minute}
          disabled={!hour}
          aria-invalid={invalid}
          onChange={(event) => commit(hour, event.target.value)}
          className={`${selectClass} disabled:bg-slate-50 disabled:text-slate-500`}
        >
          <option value="">Mins</option>
          {minutes.map((option) => (
            <option
              key={option}
              value={option}
              disabled={Boolean(hour && isTimeDisabled?.(`${hour}:${option}`))}
            >
              {option}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

const initialState: EventActionState = {};

export function EventForm({
  mode,
  eventId,
  types,
  venues,
  initialValues,
}: {
  mode: "create" | "edit";
  eventId?: string;
  types: EventFormTypeOption[];
  venues: EventFormVenueOption[];
  initialValues?: EventFormInitialValues;
}) {
  const action = mode === "create" ? createEventAction : updateEventAction;
  const validatedAction = useMemo(
    () => withClientValidation(parseEventFormData, action),
    [action],
  );
  const [state, formAction, pending] = useActionState(
    validatedAction,
    initialState,
  );
  const formId = useId();

  const [eventTypeId, setEventTypeId] = useState(
    initialValues?.eventTypeId ?? "",
  );
  const [eventSubtypeId, setEventSubtypeId] = useState(
    initialValues?.eventSubtypeId ?? "",
  );
  const [venueQuery, setVenueQuery] = useState("");
  const [addingVenue, setAddingVenue] = useState(false);
  const [newVenueName, setNewVenueName] = useState("");
  const [briefingTime, setBriefingTime] = useState(
    initialValues?.briefingTime ?? "",
  );
  const [startTime, setStartTime] = useState(initialValues?.startTime ?? "");
  const [endTime, setEndTime] = useState(initialValues?.endTime ?? "");
  const [endsNextDay, setEndsNextDay] = useState(
    Boolean(initialValues?.endsNextDay),
  );

  const subtypes = useMemo(() => {
    return types.find((type) => type.id === eventTypeId)?.subtypes ?? [];
  }, [eventTypeId, types]);

  const filteredVenues = useMemo(() => {
    const q = venueQuery.trim().toLowerCase();
    const matches = !q
      ? venues
      : venues.filter(
          (venue) =>
            venue.name.toLowerCase().includes(q) ||
            (venue.postcode?.toLowerCase().includes(q) ?? false),
        );
    const selectedId = initialValues?.venueId;
    if (selectedId && !matches.some((venue) => venue.id === selectedId)) {
      const selected = venues.find((venue) => venue.id === selectedId);
      if (selected) {
        return [selected, ...matches];
      }
    }
    return matches;
  }, [venueQuery, venues, initialValues?.venueId]);

  function startAddingVenue(name = "") {
    setNewVenueName(name || venueQuery.trim());
    setAddingVenue(true);
  }

  function errorId(name: string) {
    return `${formId}-${name}-error`;
  }

  return (
    <form action={formAction} className="space-y-8" noValidate>
      {eventId ? <input type="hidden" name="eventId" value={eventId} /> : null}

      {state.error ? <FormAlert>{state.error}</FormAlert> : null}

      <fieldset className="space-y-4">
        <legend className="text-base font-semibold text-slate-900">
          Event details
        </legend>

        <div>
          <label htmlFor={`${formId}-name`} className="mb-1 block text-sm font-medium text-slate-700">
            Event name <span className="text-red-700">*</span>
          </label>
          <input
            id={`${formId}-name`}
            name="name"
            required
            minLength={2}
            maxLength={160}
            defaultValue={initialValues?.name ?? ""}
            aria-required="true"
            aria-invalid={Boolean(state.fieldErrors?.name)}
            aria-describedby={state.fieldErrors?.name ? errorId("name") : undefined}
            className={controlClassName("w-full")}
          />
          <FieldError id={errorId("name")} messages={state.fieldErrors?.name} />
        </div>

        <div>
          <label htmlFor={`${formId}-reference`} className="mb-1 block text-sm font-medium text-slate-700">
            Reference / booking number
          </label>
          <input
            id={`${formId}-reference`}
            name="reference"
            maxLength={80}
            defaultValue={initialValues?.reference ?? ""}
            aria-invalid={Boolean(state.fieldErrors?.reference)}
            aria-describedby={state.fieldErrors?.reference ? errorId("reference") : undefined}
            className={controlClassName("w-full")}
          />
          <FieldError id={errorId("reference")} messages={state.fieldErrors?.reference} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${formId}-type`} className="mb-1 block text-sm font-medium text-slate-700">
              Event type <span className="text-red-700">*</span>
            </label>
            <select
              id={`${formId}-type`}
              name="eventTypeId"
              required
              value={eventTypeId}
              aria-required="true"
              aria-invalid={Boolean(state.fieldErrors?.eventTypeId)}
              aria-describedby={state.fieldErrors?.eventTypeId ? errorId("type") : undefined}
              onChange={(event) => {
                const nextType = event.target.value;
                setEventTypeId(nextType);
                const nextSubtypes =
                  types.find((type) => type.id === nextType)?.subtypes ?? [];
                setEventSubtypeId(
                  nextSubtypes.some((subtype) => subtype.id === eventSubtypeId)
                    ? eventSubtypeId
                    : "",
                );
              }}
              className={controlClassName("w-full bg-white")}
            >
              <option value="">Select type</option>
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
            <FieldError id={errorId("type")} messages={state.fieldErrors?.eventTypeId} />
          </div>

          <div>
            <label htmlFor={`${formId}-subtype`} className="mb-1 block text-sm font-medium text-slate-700">
              Event subtype <span className="text-red-700">*</span>
            </label>
            <select
              id={`${formId}-subtype`}
              name="eventSubtypeId"
              required
              value={eventSubtypeId}
              disabled={!eventTypeId}
              aria-required="true"
              aria-invalid={Boolean(state.fieldErrors?.eventSubtypeId)}
              aria-describedby={state.fieldErrors?.eventSubtypeId ? errorId("subtype") : undefined}
              onChange={(event) => setEventSubtypeId(event.target.value)}
              className={controlClassName(
                "w-full bg-white disabled:bg-slate-50 disabled:text-slate-500",
              )}
            >
              <option value="">
                {eventTypeId ? "Select subtype" : "Select a type first"}
              </option>
              {subtypes.map((subtype) => (
                <option key={subtype.id} value={subtype.id}>
                  {subtype.name}
                </option>
              ))}
            </select>
            <FieldError id={errorId("subtype")} messages={state.fieldErrors?.eventSubtypeId} />
          </div>
        </div>

        <div>
          <label htmlFor={`${formId}-status`} className="mb-1 block text-sm font-medium text-slate-700">
            Status <span className="text-red-700">*</span>
          </label>
          <select
            id={`${formId}-status`}
            name="status"
            required
            defaultValue={initialValues?.status ?? "PLANNED"}
            aria-required="true"
            aria-invalid={Boolean(state.fieldErrors?.status)}
            className={controlClassName("w-full bg-white sm:max-w-xs")}
          >
            {EVENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {EVENT_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
          <FieldError id={errorId("status")} messages={state.fieldErrors?.status} />
        </div>
      </fieldset>

      <fieldset className="space-y-4 border-t border-slate-200 pt-6">
        <legend className="text-base font-semibold text-slate-900">
          Venue and timing
        </legend>

        <div>
          <label htmlFor={`${formId}-venue-search`} className="mb-1 block text-sm font-medium text-slate-700">
            Search venues
          </label>
          <input
            id={`${formId}-venue-search`}
            type="search"
            value={venueQuery}
            onChange={(event) => setVenueQuery(event.target.value)}
            placeholder="Filter by venue name or postcode"
            className={controlClassName("w-full")}
          />
        </div>

        {addingVenue ? (
          <div className="space-y-4 rounded-md border border-slate-200 bg-slate-50 p-4">
            <input type="hidden" name="venueId" value="" />
            <p className="text-sm font-medium text-slate-900">New venue</p>
            <p className="text-sm text-slate-600">
              This venue is saved with the event and added to the venue list for
              next time.
            </p>
            <div>
              <label htmlFor={`${formId}-new-venue`} className="mb-1 block text-sm font-medium text-slate-700">
                Venue name <span className="text-red-700">*</span>
              </label>
              <input
                id={`${formId}-new-venue`}
                name="newVenueName"
                required
                minLength={2}
                maxLength={160}
                value={newVenueName}
                onChange={(event) => setNewVenueName(event.target.value)}
                aria-required="true"
                aria-invalid={Boolean(state.fieldErrors?.newVenueName)}
                aria-describedby={state.fieldErrors?.newVenueName ? errorId("newVenue") : undefined}
                className={controlClassName("w-full bg-white")}
              />
              <FieldError id={errorId("newVenue")} messages={state.fieldErrors?.newVenueName} />
            </div>
            <div>
              <label htmlFor={`${formId}-new-address`} className="mb-1 block text-sm font-medium text-slate-700">
                Address line
              </label>
              <input
                id={`${formId}-new-address`}
                name="newVenueAddressLine1"
                maxLength={160}
                aria-invalid={Boolean(state.fieldErrors?.newVenueAddressLine1)}
                className={controlClassName("w-full bg-white")}
              />
              <FieldError
                id={errorId("newAddress")}
                messages={state.fieldErrors?.newVenueAddressLine1}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor={`${formId}-new-town`} className="mb-1 block text-sm font-medium text-slate-700">
                  Town / city
                </label>
                <input
                  id={`${formId}-new-town`}
                  name="newVenueTownCity"
                  maxLength={120}
                  className={controlClassName("w-full bg-white")}
                />
                <FieldError
                  id={errorId("newTown")}
                  messages={state.fieldErrors?.newVenueTownCity}
                />
              </div>
              <div>
                <label htmlFor={`${formId}-new-postcode`} className="mb-1 block text-sm font-medium text-slate-700">
                  Postcode
                </label>
                <input
                  id={`${formId}-new-postcode`}
                  name="newVenuePostcode"
                  autoComplete="postal-code"
                  className={controlClassName("w-full bg-white")}
                />
              </div>
            </div>
            <button
              type="button"
              className="text-sm font-medium text-slate-700 underline"
              onClick={() => setAddingVenue(false)}
            >
              Choose an existing venue instead
            </button>
          </div>
        ) : (
          <div>
            <label htmlFor={`${formId}-venue`} className="mb-1 block text-sm font-medium text-slate-700">
              Venue <span className="text-red-700">*</span>
            </label>
            {filteredVenues.length > 0 ? (
              <select
                id={`${formId}-venue`}
                name="venueId"
                required
                defaultValue={initialValues?.venueId ?? ""}
                aria-required="true"
                aria-invalid={Boolean(state.fieldErrors?.venueId)}
                aria-describedby={state.fieldErrors?.venueId ? errorId("venue") : undefined}
                className={controlClassName("w-full bg-white")}
              >
                <option value="">Select venue</option>
                {filteredVenues.map((venue) => (
                  <option key={venue.id} value={venue.id}>
                    {venue.name}
                    {venue.postcode ? ` · ${venue.postcode}` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <input type="hidden" name="venueId" value="" />
            )}
            <FieldError id={errorId("venue")} messages={state.fieldErrors?.venueId} />
            {filteredVenues.length === 0 ? (
              <div className="mt-2 rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-3">
                <p className="text-sm font-medium text-slate-800">
                  {venueQuery.trim()
                    ? `No venues match “${venueQuery.trim()}”.`
                    : "No venues are saved yet."}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  Create one here and it will be saved for future events.
                </p>
                <button
                  type="button"
                  className="mt-3 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
                  onClick={() => startAddingVenue()}
                >
                  {venueQuery.trim()
                    ? `Create “${venueQuery.trim()}” as a new venue`
                    : "Create a new venue"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="mt-2 text-sm font-medium text-slate-700 underline"
                onClick={() => startAddingVenue()}
              >
                Can&apos;t find it? Add a new venue
              </button>
            )}
            <p className="mt-2 text-xs text-slate-500">
              Manage the full venue list in{" "}
              <Link href="/settings/events" className="font-medium underline">
                Venues
              </Link>
              .
            </p>
          </div>
        )}

        <div>
          <label htmlFor={`${formId}-date`} className="mb-1 block text-sm font-medium text-slate-700">
            Event date <span className="text-red-700">*</span>
          </label>
          <input
            id={`${formId}-date`}
            name="eventDate"
            type="date"
            required
            defaultValue={initialValues?.eventDate ?? ""}
            aria-required="true"
            aria-invalid={Boolean(state.fieldErrors?.eventDate)}
            aria-describedby={state.fieldErrors?.eventDate ? errorId("date") : undefined}
            className={controlClassName("w-full sm:max-w-xs")}
          />
          <FieldError id={errorId("date")} messages={state.fieldErrors?.eventDate} />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p id={`${formId}-briefing-label`} className="mb-1 text-sm font-medium text-slate-700">
              Briefing time
            </p>
            <HourMinuteFields
              id={`${formId}-briefing`}
              name="briefingTime"
              value={briefingTime}
              labelledBy={`${formId}-briefing-label`}
              invalid={Boolean(state.fieldErrors?.briefingTime)}
              describedBy={`${formId}-briefing-help ${state.fieldErrors?.briefingTime ? errorId("briefing") : ""}`.trim()}
              isTimeDisabled={(time) =>
                Boolean(startTime && !isTimeBefore(time, startTime))
              }
              onChange={setBriefingTime}
            />
            <p id={`${formId}-briefing-help`} className="mt-1 text-xs text-slate-500">
              Must be earlier than the start time. Minutes are in 5-minute steps.
            </p>
            <FieldError id={errorId("briefing")} messages={state.fieldErrors?.briefingTime} />
          </div>
          <div>
            <p id={`${formId}-start-label`} className="mb-1 text-sm font-medium text-slate-700">
              Start time
            </p>
            <HourMinuteFields
              id={`${formId}-start`}
              name="startTime"
              value={startTime}
              labelledBy={`${formId}-start-label`}
              invalid={Boolean(state.fieldErrors?.startTime)}
              describedBy={state.fieldErrors?.startTime ? errorId("start") : undefined}
              onChange={(next) => {
                setStartTime(next);
                if (
                  briefingTime &&
                  next &&
                  !isTimeBefore(briefingTime, next)
                ) {
                  setBriefingTime("");
                }
                if (
                  !endsNextDay &&
                  endTime &&
                  next &&
                  !isTimeBefore(next, endTime)
                ) {
                  setEndTime("");
                }
              }}
            />
            <FieldError id={errorId("start")} messages={state.fieldErrors?.startTime} />
          </div>
          <div>
            <p id={`${formId}-end-label`} className="mb-1 text-sm font-medium text-slate-700">
              End time
            </p>
            <HourMinuteFields
              id={`${formId}-end`}
              name="endTime"
              value={endTime}
              labelledBy={`${formId}-end-label`}
              invalid={Boolean(state.fieldErrors?.endTime)}
              describedBy={`${formId}-end-help ${state.fieldErrors?.endTime ? errorId("end") : ""}`.trim()}
              isTimeDisabled={(time) => {
                if (!startTime) return false;
                if (endsNextDay) return time === startTime;
                return !isTimeBefore(startTime, time);
              }}
              onChange={setEndTime}
            />
            <p id={`${formId}-end-help`} className="mt-1 text-xs text-slate-500">
              Must be later than the start time. Minutes are in 5-minute steps.
            </p>
            <FieldError id={errorId("end")} messages={state.fieldErrors?.endTime} />
          </div>
        </div>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="endsNextDay"
            checked={endsNextDay}
            onChange={(event) => setEndsNextDay(event.target.checked)}
            className="mt-0.5 rounded border-slate-300"
          />
          <span>
            Ends the next day
            <span className="mt-0.5 block text-xs text-slate-500">
              Use this for overnight events, for example a start at 22:00 and an
              end at 02:00.
            </span>
          </span>
        </label>
      </fieldset>

      <fieldset className="space-y-4 border-t border-slate-200 pt-6">
        <legend className="text-base font-semibold text-slate-900">
          Staffing and risk
        </legend>
        <p className="text-sm text-slate-600">
          These thresholds are stored now so future risk alerts can flag events
          whose fill rate drops below them. Live fill-rate calculation is not
          enabled yet.
        </p>

        <div>
          <label htmlFor={`${formId}-staff`} className="mb-1 block text-sm font-medium text-slate-700">
            Staff required <span className="text-red-700">*</span>
          </label>
          <input
            id={`${formId}-staff`}
            name="staffRequired"
            type="number"
            inputMode="numeric"
            required
            min={1}
            max={100000}
            step={1}
            defaultValue={initialValues?.staffRequired ?? ""}
            aria-required="true"
            aria-invalid={Boolean(state.fieldErrors?.staffRequired)}
            aria-describedby={state.fieldErrors?.staffRequired ? errorId("staff") : undefined}
            className={controlClassName("w-full sm:max-w-xs")}
          />
          <FieldError id={errorId("staff")} messages={state.fieldErrors?.staffRequired} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${formId}-warning`} className="mb-1 block text-sm font-medium text-slate-700">
              Warning fill rate (%) <span className="text-red-700">*</span>
            </label>
            <input
              id={`${formId}-warning`}
              name="warningFillRate"
              type="number"
              inputMode="numeric"
              required
              min={1}
              max={100}
              step={1}
              defaultValue={initialValues?.warningFillRate ?? DEFAULT_WARNING_FILL_RATE}
              aria-required="true"
              aria-invalid={Boolean(state.fieldErrors?.warningFillRate)}
              className={controlClassName("w-full")}
            />
            <FieldError id={errorId("warning")} messages={state.fieldErrors?.warningFillRate} />
          </div>
          <div>
            <label htmlFor={`${formId}-critical`} className="mb-1 block text-sm font-medium text-slate-700">
              Critical fill rate (%) <span className="text-red-700">*</span>
            </label>
            <input
              id={`${formId}-critical`}
              name="criticalFillRate"
              type="number"
              inputMode="numeric"
              required
              min={1}
              max={100}
              step={1}
              defaultValue={initialValues?.criticalFillRate ?? DEFAULT_CRITICAL_FILL_RATE}
              aria-required="true"
              aria-invalid={Boolean(state.fieldErrors?.criticalFillRate)}
              aria-describedby={state.fieldErrors?.criticalFillRate ? errorId("critical") : undefined}
              className={controlClassName("w-full")}
            />
            <FieldError id={errorId("critical")} messages={state.fieldErrors?.criticalFillRate} />
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-4 border-t border-slate-200 pt-6">
        <legend className="text-base font-semibold text-slate-900">Notes</legend>
        <div>
          <label htmlFor={`${formId}-notes`} className="mb-1 block text-sm font-medium text-slate-700">
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
            ? "Create event"
            : "Save changes"}
      </button>
    </form>
  );
}
