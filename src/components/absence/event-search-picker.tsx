"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { searchAbsenceEventsAction } from "@/app/(app)/absence/actions";
import { FieldError, controlClassName } from "@/components/form";
import { formatLocalDateDisplay, parseLocalDate } from "@/lib/events/dates";
import type { AbsenceEventOption } from "@/lib/absence/queries";

function formatEventDate(iso: string): string {
  const date = parseLocalDate(iso);
  return date ? formatLocalDateDisplay(date) : iso;
}

export function EventSearchPicker({
  initialEvent,
  errorId,
  errorMessages,
  onSelect,
}: {
  initialEvent?: AbsenceEventOption | null;
  errorId: string;
  errorMessages?: string[];
  onSelect?: (event: AbsenceEventOption | null) => void;
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

  function choose(event: AbsenceEventOption) {
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
        const found = await searchAbsenceEventsAction(query);
        setResults(found);
        setActiveIndex(0);
        setOpen(true);
      });
    }, 250);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, selected, focused]);

  return (
    <div>
      <label
        htmlFor={fieldId}
        className="mb-1 block text-sm font-medium text-slate-700"
      >
        Event <span className="text-red-700">*</span>
      </label>
      <input type="hidden" name="eventId" value={selected?.id ?? ""} />
      <input type="hidden" name="eventDate" value={selected?.eventDate ?? ""} />
      <input
        type="hidden"
        name="eventStartTime"
        value={selected?.startTime ?? ""}
      />
      {selected ? (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          <div>
            <p className="font-medium text-slate-900">{selected.name}</p>
            <p className="text-sm text-slate-600">
              {formatEventDate(selected.eventDate)}
              {selected.startTime ? ` · ${selected.startTime}` : ""}
              {` · ${selected.venueName}`}
              {selected.reference ? ` · ${selected.reference}` : ""}
            </p>
            <p className="text-sm text-slate-600">
              {selected.eventTypeName} / {selected.eventSubtypeName}
            </p>
          </div>
          <button
            type="button"
            onClick={clear}
            className="text-sm font-medium text-slate-700 underline hover:text-slate-900"
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
                  results.length === 0 ? 0 : (index + 1) % results.length,
                );
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((index) =>
                  results.length === 0
                    ? 0
                    : (index - 1 + results.length) % results.length,
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
              className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg"
            >
              {pending && results.length === 0 ? (
                <li className="px-3 py-2 text-sm text-slate-500">Searching…</li>
              ) : results.length === 0 ? (
                <li className="px-3 py-2 text-sm text-slate-500">
                  No matching events in this organisation.
                </li>
              ) : (
                results.map((event, index) => (
                  <li
                    id={`${listId}-${event.id}`}
                    key={event.id}
                    role="option"
                    aria-selected={index === activeIndex}
                    className={`cursor-pointer px-3 py-2 text-sm ${
                      index === activeIndex ? "bg-slate-100" : ""
                    }`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onMouseDown={(mouseEvent) => {
                      mouseEvent.preventDefault();
                      choose(event);
                    }}
                  >
                    <span className="font-medium text-slate-900">
                      {event.name}
                    </span>
                    <span className="text-slate-600">
                      {" "}
                      · {formatEventDate(event.eventDate)} · {event.venueName}
                      {event.reference ? ` · ${event.reference}` : ""}
                    </span>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </div>
      )}
      <FieldError id={errorId} messages={errorMessages} />
    </div>
  );
}
