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
  ariaLabel,
  labelledBy,
}: {
  id: string;
  name: string;
  reasons: CatalogReasonOption[];
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  describedBy?: string;
  required?: boolean;
  ariaLabel?: string;
  labelledBy?: string;
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

  const useSegments = labels.length + 1 < 6 && choice !== "__legacy";
  const choiceClass = (selected: boolean) =>
    `inline-flex cursor-pointer items-center rounded-md border px-3 py-1.5 text-sm has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary ${
      selected
        ? "border-primary/30 bg-primary-soft text-primary-hover"
        : "border-border bg-surface text-foreground"
    }`;

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={value} />
      {useSegments ? (
        <div
          id={id}
          role="radiogroup"
          aria-label={labelledBy ? undefined : ariaLabel}
          aria-labelledby={labelledBy}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          aria-required={required || undefined}
          tabIndex={invalid ? -1 : undefined}
          className="flex flex-wrap gap-2"
        >
          {labels.map((label) => (
            <label key={label} className={choiceClass(choice === label)}>
              <input
                type="radio"
                name={`${id}-choice`}
                checked={choice === label}
                className="sr-only"
                onChange={() => publish(label, note)}
              />
              {label}
            </label>
          ))}
          <label className={choiceClass(choice === "__other")}>
            <input
              type="radio"
              name={`${id}-choice`}
              checked={choice === "__other"}
              className="sr-only"
              onChange={() => publish("__other", note)}
            />
            Other
          </label>
        </div>
      ) : (
        <select
          id={id}
          value={choice}
          aria-label={labelledBy ? undefined : ariaLabel}
          aria-labelledby={labelledBy}
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
      )}
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
