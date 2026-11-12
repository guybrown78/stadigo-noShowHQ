"use client";

import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { searchAbsenceEventsAction } from "@/app/(app)/absence/actions";
import { FieldError, controlClassName } from "@/components/form";
import { formatLocalDateDisplay, parseLocalDate } from "@/lib/events/dates";
import type { AbsenceEventOption } from "@/lib/absence/queries";

function formatEventDate(iso: string): string {
  const date = parseLocalDate(iso);
  return date ? formatLocalDateDisplay(date) : iso;
}

export function firstSelectableIndex(
  results: AbsenceEventOption[],
  unavailable: ReadonlySet<string>,
): number {
  const index = results.findIndex((event) => !unavailable.has(event.id));
  return index === -1 ? 0 : index;
}

export function partitionSearchResults<T extends { id: string }>(
  results: T[],
  unavailable: ReadonlySet<string>,
): {
  available: { event: T; index: number }[];
  taken: { event: T; index: number }[];
} {
  const available: { event: T; index: number }[] = [];
  const taken: { event: T; index: number }[] = [];
  results.forEach((event, index) => {
    (unavailable.has(event.id) ? taken : available).push({ event, index });
  });
  return { available, taken };
}

export function stepSelectableIndex(
  results: AbsenceEventOption[],
  index: number,
  direction: 1 | -1,
  unavailable: ReadonlySet<string>,
): number {
  if (results.length === 0) {
    return 0;
  }
  for (let step = 1; step <= results.length; step += 1) {
    const next = (index + direction * step + results.length) % results.length;
    if (!unavailable.has(results[next]!.id)) {
      return next;
    }
  }
  return index;
}

function eventDetail(event: AbsenceEventOption): string {
  return `${formatEventDate(event.eventDate)} · ${event.venueName}${
    event.reference ? ` · ${event.reference}` : ""
  }`;
}

function SearchResultGroups({
  results,
  unavailable,
  activeIndex,
  listId,
  unavailableLabel,
  onHover,
  onChoose,
}: {
  results: AbsenceEventOption[];
  unavailable: ReadonlySet<string>;
  activeIndex: number;
  listId: string;
  unavailableLabel: string;
  onHover: (index: number) => void;
  onChoose: (event: AbsenceEventOption) => void;
}) {
  const { available, taken } = partitionSearchResults(results, unavailable);
  return (
    <>
      {available.length > 0 && taken.length > 0 ? (
        <li
          role="presentation"
          className="bg-surface px-3 py-1.5 text-xs font-medium text-foreground"
        >
          Can add
        </li>
      ) : null}
      {available.length === 0 && taken.length > 0 ? (
        <li role="presentation" className="px-3 py-2 text-sm text-muted">
          Nothing else matches.
        </li>
      ) : null}
      {available.map(({ event, index }) => (
        <li
          id={`${listId}-${event.id}`}
          key={event.id}
          role="option"
          aria-selected={index === activeIndex}
          className={`cursor-pointer px-3 py-2 text-sm ${
            index === activeIndex ? "bg-slate-100" : ""
          }`}
          onMouseEnter={() => onHover(index)}
          onMouseDown={(mouseEvent) => {
            mouseEvent.preventDefault();
            onChoose(event);
          }}
        >
          <span className="font-medium text-foreground">{event.name}</span>
          <span className="text-muted"> · {eventDetail(event)}</span>
        </li>
      ))}
      {taken.length > 0 ? (
        <li
          role="presentation"
          className="sticky top-0 border-t border-border bg-wash px-3 py-1.5 text-xs font-medium text-muted"
        >
          {unavailableLabel}
        </li>
      ) : null}
      {taken.map(({ event }) => (
        <li
          id={`${listId}-${event.id}`}
          key={event.id}
          role="option"
          aria-disabled="true"
          aria-selected={false}
          className="cursor-not-allowed bg-wash px-3 py-2 text-sm text-muted"
          onMouseDown={(mouseEvent) => mouseEvent.preventDefault()}
        >
          <span className="font-medium line-through">
            {event.name}
          </span>
          <span> · {eventDetail(event)}</span>
        </li>
      ))}
    </>
  );
}

export function EventSearchPicker({
  initialEvent,
  errorId,
  errorMessages,
  onSelect,
  searchMode = "cancellation",
  label = "Event",
  submitSelection = true,
  required = true,
  unavailableEventIds,
  unavailableLabel = "Already on this sickness",
}: {
  initialEvent?: AbsenceEventOption | null;
  errorId: string;
  errorMessages?: string[];
  onSelect?: (event: AbsenceEventOption | null) => void;
  searchMode?: "cancellation" | "awol";
  label?: string;
  /** When false, the parent form owns which events are submitted. */
  submitSelection?: boolean;
  required?: boolean;
  /** Events that stay visible in search but cannot be chosen. */
  unavailableEventIds?: readonly string[];
  unavailableLabel?: string;
}) {
  const fieldId = useId();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AbsenceEventOption | null>(
    initialEvent ?? null,
  );
  const [results, setResults] = useState<AbsenceEventOption[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [focused, setFocused] = useState(false);
  const [pending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unavailable = useMemo(
    () => new Set(unavailableEventIds ?? []),
    [unavailableEventIds],
  );
  const unavailableRef = useRef(unavailable);
  unavailableRef.current = unavailable;

  function choose(event: AbsenceEventOption) {
    if (unavailable.has(event.id)) {
      return;
    }
    setSelected(event);
    setQuery("");
    setOpen(false);
    onSelect?.(event);
  }

  function clear() {
    setSelected(null);
    setQuery("");
    setResults([]);
    setOpen(false);
    onSelect?.(null);
  }

  useEffect(() => {
    if (selected) {
      return;
    }
    if (!focused && query.trim() === "") {
      return;
    }
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        const found = await searchAbsenceEventsAction(query, searchMode);
        setResults(found);
        setActiveIndex(firstSelectableIndex(found, unavailableRef.current));
        setOpen(true);
      });
    }, 250);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, selected, focused, searchMode]);

  return (
    <div>
      <label
        htmlFor={fieldId}
        className="mb-1 block text-sm font-medium text-foreground"
      >
        {label}
        {required ? <span className="text-red-700"> *</span> : null}
      </label>
      {submitSelection ? (
        <>
          <input type="hidden" name="eventId" value={selected?.id ?? ""} />
          <input type="hidden" name="eventDate" value={selected?.eventDate ?? ""} />
          <input
            type="hidden"
            name="eventStartTime"
            value={selected?.startTime ?? ""}
          />
        </>
      ) : null}
      {selected ? (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border bg-wash px-3 py-2">
          <div>
            <p className="font-medium text-foreground">{selected.name}</p>
            <p className="text-sm text-muted">
              {formatEventDate(selected.eventDate)}
              {selected.startTime ? ` · ${selected.startTime}` : ""}
              {` · ${selected.venueName}`}
              {selected.reference ? ` · ${selected.reference}` : ""}
            </p>
            <p className="text-sm text-muted">
              {selected.eventTypeName} / {selected.eventSubtypeName}
            </p>
          </div>
          <button
            type="button"
            onClick={clear}
            className="text-sm font-medium text-foreground underline hover:text-foreground"
          >
            Change
          </button>
        </div>
      ) : (
        <div className="relative">
          <input
            id={fieldId}
            type="search"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={listId}
            aria-activedescendant={
              open && results[activeIndex]
                ? `${listId}-${results[activeIndex].id}`
                : undefined
            }
            aria-invalid={Boolean(errorMessages?.length)}
            aria-describedby={errorMessages?.length ? errorId : undefined}
            value={query}
            onChange={(event) => {
              setFocused(true);
              setQuery(event.target.value);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              setOpen(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((index) =>
                  stepSelectableIndex(results, index, 1, unavailable),
                );
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((index) =>
                  stepSelectableIndex(results, index, -1, unavailable),
                );
              } else if (event.key === "Enter") {
                event.preventDefault();
                const active = results[activeIndex];
                if (active) {
                  choose(active);
                }
              } else if (event.key === "Escape") {
                setOpen(false);
              }
            }}
            placeholder="Search by name, reference, venue or date"
            autoComplete="off"
            className={controlClassName("w-full")}
          />
          {open ? (
            <ul
              id={listId}
              role="listbox"
              className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-surface shadow-lg"
            >
              {pending && results.length === 0 ? (
                <li className="px-3 py-2 text-sm text-muted">Searching…</li>
              ) : results.length === 0 ? (
                <li className="px-3 py-2 text-sm text-muted">
                  No matching events in this organisation.
                </li>
              ) : (
                <SearchResultGroups
                  results={results}
                  unavailable={unavailable}
                  activeIndex={activeIndex}
                  listId={listId}
                  unavailableLabel={unavailableLabel}
                  onHover={setActiveIndex}
                  onChoose={choose}
                />
              )}
            </ul>
          ) : null}
        </div>
      )}
      <FieldError id={errorId} messages={errorMessages} />
    </div>
  );
}
