"use client";

import { Ban, Bed, Check, UserX } from "lucide-react";
import { cn } from "@/lib/cn";

export type LogAbsenceType = "CANCELLATION" | "AWOL" | "SICKNESS";

export function AbsenceTypeSelector({
  value,
  onChange,
  locked,
}: {
  value: LogAbsenceType;
  onChange?: (value: LogAbsenceType) => void;
  locked?: boolean;
}) {
  return (
    <fieldset>
      <legend className="sr-only">Absence type</legend>
      <div className="grid gap-3 sm:grid-cols-3">
        <TypeCard
          selected={value === "CANCELLATION"}
          disabled={locked && value !== "CANCELLATION"}
          onSelect={locked ? undefined : () => onChange?.("CANCELLATION")}
          icon={Ban}
          label="Cancellation"
          description="Staff notified before or after the event"
          tone="cancel"
        />
        <TypeCard
          selected={value === "AWOL"}
          disabled={locked && value !== "AWOL"}
          onSelect={locked ? undefined : () => onChange?.("AWOL")}
          icon={UserX}
          label="AWOL"
          description="Did not attend with no prior notice"
          tone="awol"
        />
        <TypeCard
          selected={value === "SICKNESS"}
          disabled={locked && value !== "SICKNESS"}
          onSelect={locked ? undefined : () => onChange?.("SICKNESS")}
          icon={Bed}
          label="Sickness"
          description="Staff member reported that sickness affects work"
          tone="sickness"
        />
      </div>
      <p className="mt-3 text-sm text-slate-600">
        {value === "AWOL"
          ? "Use AWOL when a staff member did not attend an Event and gave no prior notice."
          : value === "SICKNESS"
            ? "Record the initial sickness report. Certificates, follow-ups and return-to-work actions will be added in later steps."
            : "A cancellation means the staff member notified the organisation before the event. You can still record a late or retrospective cancellation when notice arrived after the event."}
      </p>
    </fieldset>
  );
}

function TypeCard({
  selected,
  disabled,
  onSelect,
  icon: Icon,
  label,
  description,
  tone,
}: {
  selected: boolean;
  disabled?: boolean;
  onSelect?: () => void;
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
      ? "text-awol"
      : tone === "sickness"
        ? "text-sickness"
        : "text-cancel";

  if (disabled) {
    return (
      <p className="rounded-xl border border-border bg-slate-50 px-4 py-4 text-slate-400">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="size-4" aria-hidden="true" />
          {label}
        </span>
        <span className="mt-1 block text-xs">{description}</span>
      </p>
    );
  }

  if (!onSelect) {
    return (
      <p className={cn("rounded-xl px-4 py-4", selectedClass)}>
        <span className={cn("flex items-center gap-2 text-sm font-semibold", labelClass)}>
          <Icon className="size-4" aria-hidden="true" />
          {label}
          {selected ? <Check className="size-4" aria-hidden="true" /> : null}
        </span>
        <span className="mt-1 block text-xs text-slate-600">{description}</span>
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "rounded-xl px-4 py-4 text-left",
        selected
          ? selectedClass
          : "border border-border bg-white hover:bg-slate-50",
      )}
    >
      <span
        className={cn(
          "flex items-center gap-2 text-sm font-semibold",
          selected ? labelClass : "text-slate-800",
        )}
      >
        <Icon className="size-4" aria-hidden="true" />
        {label}
        {selected ? <Check className="size-4" aria-hidden="true" /> : null}
      </span>
      <span className="mt-1 block text-xs text-slate-600">{description}</span>
    </button>
  );
}
