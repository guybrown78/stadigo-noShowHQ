"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { searchAbsenceStaffAction } from "@/app/(app)/absence/actions";
import { FieldError, controlClassName } from "@/components/form";
import { EMPLOYMENT_STATUS_LABELS, formatStaffName } from "@/lib/staff/display";
import type { AbsenceStaffOption } from "@/lib/absence/queries";

export function StaffSearchPicker({
  initialStaff,
  errorId,
  errorMessages,
  onSelect,
}: {
  initialStaff?: AbsenceStaffOption | null;
  errorId: string;
  errorMessages?: string[];
  onSelect?: (staff: AbsenceStaffOption | null) => void;
}) {
  const fieldId = useId();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AbsenceStaffOption | null>(
    initialStaff ?? null,
  );
  const [results, setResults] = useState<AbsenceStaffOption[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [focused, setFocused] = useState(false);
  const [pending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function choose(staff: AbsenceStaffOption) {
    setSelected(staff);
    setQuery("");
    setOpen(false);
    onSelect?.(staff);
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
        const found = await searchAbsenceStaffAction(query);
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
        Staff member <span className="text-red-700">*</span>
      </label>
      <input type="hidden" name="staffId" value={selected?.id ?? ""} />
      {selected ? (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          <div>
            <p className="font-medium text-slate-900">
              {formatStaffName(selected)}{" "}
              <span className="font-normal text-slate-600">
                ({selected.staffIdNumber})
              </span>
            </p>
            <p className="text-sm text-slate-600">
              {selected.roleTitle} ·{" "}
              {EMPLOYMENT_STATUS_LABELS[selected.employmentStatus]}
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
            placeholder="Search by name or staff ID"
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
                  No matching staff in this organisation.
                </li>
              ) : (
                results.map((staff, index) => (
                  <li
                    id={`${listId}-${staff.id}`}
                    key={staff.id}
                    role="option"
                    aria-selected={index === activeIndex}
                    className={`cursor-pointer px-3 py-2 text-sm ${
                      index === activeIndex ? "bg-slate-100" : ""
                    }`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      choose(staff);
                    }}
                  >
                    <span className="font-medium text-slate-900">
                      {formatStaffName(staff)}
                    </span>
                    <span className="text-slate-600">
                      {" "}
                      · {staff.staffIdNumber} · {staff.roleTitle} ·{" "}
                      {EMPLOYMENT_STATUS_LABELS[staff.employmentStatus]}
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
