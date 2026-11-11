"use client";

import { Ban, Bed, Check, UserX } from "lucide-react";
import { cn } from "@/lib/cn";

export type LogAbsenceType = "CANCELLATION" | "AWOL" | "SICKNESS";

const TONE_CLASS = {
  cancel: {
    on: "border-cancel bg-cancel text-white",
    off: "border-cancel bg-cancel-soft text-cancel hover:bg-surface",
  },
  awol: {
    on: "border-awol bg-awol text-awol-on",
    off: "border-awol bg-awol-soft text-awol-ink hover:bg-surface",
  },
  sickness: {
    on: "border-sickness bg-sickness text-white",
    off: "border-sickness bg-sickness-soft text-sickness hover:bg-surface",
  },
} as const;

const TYPES: Array<{
  value: LogAbsenceType;
  label: string;
  description: string;
  icon: typeof Ban;
  tone: "cancel" | "awol" | "sickness";
}> = [
  {
    value: "CANCELLATION",
    label: "Cancellation",
    description: "Staff notified before or after the event",
    icon: Ban,
    tone: "cancel",
  },
  {
    value: "AWOL",
    label: "AWOL",
    description: "Did not attend with no prior notice",
    icon: UserX,
    tone: "awol",
  },
  {
    value: "SICKNESS",
    label: "Sickness",
    description: "Staff member reported that sickness affects work",
    icon: Bed,
    tone: "sickness",
  },
];

export function AbsenceTypeSelector({
  value,
  onChange,
  locked,
}: {
  value: LogAbsenceType;
  onChange?: (value: LogAbsenceType) => void;
  locked?: boolean;
}) {
  const selected = TYPES.find((type) => type.value === value) ?? TYPES[0];

  if (!locked && onChange) {
    return (
      <fieldset>
        <legend className="text-sm font-medium text-foreground">Absence type</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {TYPES.map((type) => {
            const pressed = value === type.value;
            const Icon = type.icon;
            return (
              <button
                key={type.value}
                type="button"
                aria-pressed={pressed}
                onClick={() => onChange(type.value)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium",
                  TONE_CLASS[type.tone][pressed ? "on" : "off"],
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {type.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-sm text-muted">{selected.description}</p>
      </fieldset>
    );
  }

  return (
    <fieldset>
      <legend className="sr-only">Absence type</legend>
      <div className="grid gap-3 sm:grid-cols-3">
        {TYPES.map((type) => (
          <TypeCard
            key={type.value}
            selected={value === type.value}
            disabled={locked && value !== type.value}
            icon={type.icon}
            label={type.label}
            description={type.description}
            tone={type.tone}
          />
        ))}
      </div>
    </fieldset>
  );
}

function TypeCard({
  selected,
  disabled,
  icon: Icon,
  label,
  description,
  tone,
}: {
  selected: boolean;
  disabled?: boolean;
  icon: typeof Ban;
  label: string;
  description: string;
  tone: "cancel" | "awol" | "sickness";
}) {
  const selectedClass =
    tone === "awol"
      ? "border-2 border-awol bg-awol-soft"
      : tone === "sickness"
        ? "border-2 border-sickness bg-sickness-soft"
        : "border-2 border-cancel bg-cancel-soft";
  const labelClass =
    tone === "awol"
      ? "text-awol-ink"
      : tone === "sickness"
        ? "text-sickness"
        : "text-cancel";

  if (disabled) {
    return (
      <p className="rounded-xl border border-border bg-wash px-4 py-4 text-muted">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="size-4" aria-hidden="true" />
          {label}
        </span>
        <span className="mt-1 block text-xs">{description}</span>
      </p>
    );
  }

  return (
    <p className={cn("rounded-xl px-4 py-4", selectedClass)}>
      <span className={cn("flex items-center gap-2 text-sm font-semibold", labelClass)}>
        <Icon className="size-4" aria-hidden="true" />
        {label}
        {selected ? <Check className="size-4" aria-hidden="true" /> : null}
      </span>
      <span className="mt-1 block text-xs text-muted">{description}</span>
    </p>
  );
}
