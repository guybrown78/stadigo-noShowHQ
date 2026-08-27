"use client";

import { useId, useState, useTransition } from "react";
import { searchStaffManagersAction } from "@/app/(app)/staff/actions";
import { FieldError, controlClassName } from "@/components/form";
import { formatStaffName } from "@/lib/staff/display";
import type { ManagerOption } from "@/lib/staff/queries";

export function ManagerPicker({
  excludeId,
  initialManager,
  errorId,
  errorMessages,
}: {
  excludeId?: string;
  initialManager?: ManagerOption | null;
  errorId: string;
  errorMessages?: string[];
}) {
  const fieldId = useId();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(initialManager?.id ?? "");
  const [results, setResults] = useState<ManagerOption[]>(
    initialManager ? [initialManager] : [],
  );
  const [pending, startTransition] = useTransition();

  function search() {
    startTransition(async () => {
      const found = await searchStaffManagersAction(query, excludeId);
      const merged = [...found];
      if (
        initialManager &&
        !merged.some((row) => row.id === initialManager.id)
      ) {
        merged.unshift(initialManager);
      }
      setResults(merged);
    });
  }

  return (
    <div>
      <label
        htmlFor={fieldId}
        className="mb-1 block text-sm font-medium text-slate-700"
      >
        Manager
      </label>
      <p className="mb-2 text-sm text-slate-500">
        Optional. Search by name or staff ID for an active colleague in this
        organisation.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          id={fieldId}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              search();
            }
          }}
          placeholder="Search name or staff ID"
          className={controlClassName("min-w-[12rem] flex-1")}
        />
        <button
          type="button"
          onClick={search}
          disabled={pending}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60"
        >
          {pending ? "Searching…" : "Search"}
        </button>
      </div>
      <select
        name="managerStaffId"
        value={selectedId}
        onChange={(event) => setSelectedId(event.target.value)}
        aria-invalid={Boolean(errorMessages?.length)}
        aria-describedby={errorMessages?.length ? errorId : undefined}
        className={controlClassName("mt-2 w-full bg-white")}
      >
        <option value="">No manager</option>
        {results.map((staff) => (
          <option key={staff.id} value={staff.id}>
            {formatStaffName(staff)} ({staff.staffIdNumber})
          </option>
        ))}
      </select>
      <FieldError id={errorId} messages={errorMessages} />
    </div>
  );
}
