"use client";

import { useState } from "react";
import { controlClassName, selectControlClassName } from "@/components/form";

export const OTHER_REASON_PREFIX = "Other: ";

export type CatalogReasonOption = {
  label: string;
};

export function splitCatalogReason(
  value: string,
  labels: string[],
): { choice: string; note: string } {
  if (labels.includes(value)) {
    return { choice: value, note: "" };
  }
  if (value.startsWith(OTHER_REASON_PREFIX)) {
    return {
      choice: "__other",
      note: value.slice(OTHER_REASON_PREFIX.length),
    };
  }
  if (value.trim()) {
    return { choice: "__legacy", note: value };
  }
  return { choice: "", note: "" };
}

export function CatalogReasonField({
  id,
  name,
  reasons,
  value,
  onChange,
  invalid,
  describedBy,
  required = false,
}: {
  id: string;
  name: string;
  reasons: CatalogReasonOption[];
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  describedBy?: string;
  required?: boolean;
}) {
  const labels = reasons.map((reason) => reason.label);
  const initial = splitCatalogReason(value, labels);
  const [choice, setChoice] = useState(initial.choice);
  const [note, setNote] = useState(initial.note);

  function publish(nextChoice: string, nextNote: string) {
    setChoice(nextChoice);
    setNote(nextNote);
    if (nextChoice === "__other") {
      const trimmed = nextNote.trim();
      onChange(
        trimmed.length >= 2 ? `${OTHER_REASON_PREFIX}${trimmed}` : "",
      );
      return;
    }
    if (nextChoice === "__legacy") {
      onChange(nextNote);
      return;
    }
    onChange(nextChoice);
  }

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={value} />
      <select
        id={id}
        value={choice}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        aria-required={required || undefined}
        className={selectControlClassName("w-full")}
        onChange={(event) => publish(event.target.value, note)}
      >
        <option value="">Select a reason</option>
        {labels.map((label) => (
          <option key={label} value={label}>
            {label}
          </option>
        ))}
        <option value="__other">Other</option>
        {choice === "__legacy" ? (
          <option value="__legacy">{note}</option>
        ) : null}
      </select>
      {choice === "__other" ? (
        <input
          id={`${id}-note`}
          value={note}
          aria-label="Other reason"
          placeholder="What was the reason?"
          className={controlClassName("w-full")}
          onChange={(event) => publish("__other", event.target.value)}
        />
      ) : null}
    </div>
  );
}
