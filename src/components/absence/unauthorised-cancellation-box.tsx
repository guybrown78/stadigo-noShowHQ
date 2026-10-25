"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import {
  setCancellationUnauthorisedAction,
  type AbsenceActionState,
} from "@/app/(app)/absence/actions";
import { FormAlert } from "@/components/form";
import { cn } from "@/lib/cn";

const initialState: AbsenceActionState = {};

export function UnauthorisedCancellationBox({
  absenceId,
  unauthorised,
  archived,
  onSaved,
}: {
  absenceId: string;
  unauthorised: boolean;
  archived: boolean;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const labelId = useId();
  const [state, formAction, pending] = useActionState(
    setCancellationUnauthorisedAction,
    initialState,
  );
  const [shown, setShown] = useState(unauthorised);
  const [saving, setSaving] = useState(false);
  const [handled, setHandled] = useState(initialState);
  const [requestId, setRequestId] = useState(0);
  const [readyToRefresh, setReadyToRefresh] = useState(0);
  const refreshedId = useRef(0);

  if (!pending && saving && state !== handled) {
    setHandled(state);
    if (state.error || typeof state.unauthorised !== "boolean") {
      setShown(unauthorised);
      setSaving(false);
    } else {
      setReadyToRefresh(requestId);
    }
  }
  if (saving && shown === unauthorised) {
    setSaving(false);
  }

  useEffect(() => {
    if (readyToRefresh === 0 || refreshedId.current === readyToRefresh) {
      return;
    }
    refreshedId.current = readyToRefresh;
    router.refresh();
    onSaved?.();
  }, [onSaved, readyToRefresh, router]);

  if (archived) {
    return (
      <SwitchRow labelId={labelId} shown={unauthorised} disabled archived />
    );
  }

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        const next = !shown;
        const field = event.currentTarget.elements.namedItem("unauthorised");
        if (field instanceof HTMLInputElement) {
          field.value = next ? "1" : "0";
        }
        setRequestId((current) => current + 1);
        setShown(next);
        setSaving(true);
      }}
    >
      <input type="hidden" name="absenceId" value={absenceId} />
      <input type="hidden" name="unauthorised" value={shown ? "0" : "1"} />
      <SwitchRow
        labelId={labelId}
        shown={shown}
        disabled={saving}
        saving={saving}
      />
      {state.error ? (
        <div className="mt-2">
          <FormAlert>{state.error}</FormAlert>
        </div>
      ) : null}
    </form>
  );
}

function SwitchRow({
  labelId,
  shown,
  disabled,
  saving = false,
  archived = false,
}: {
  labelId: string;
  shown: boolean;
  disabled: boolean;
  saving?: boolean;
  archived?: boolean;
}) {
  const hintId = useId();
  const status = shown ? "Marked" : "Not marked";
  const detail = archived
    ? "Archived, so this mark cannot be changed."
    : shown
      ? "The required information was not provided."
      : "Turn on when the required information was not provided.";

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface px-4 py-3">
      <div className="min-w-0">
        <p id={labelId} className="text-sm font-semibold text-slate-900">
          Unauthorised
        </p>
        <p id={hintId} className="mt-0.5 text-xs leading-5 text-slate-500">
          <span className="font-medium text-slate-800">{status}.</span> {detail}
        </p>
      </div>
      <button
        type={disabled && !saving ? "button" : "submit"}
        role="switch"
        aria-checked={shown}
        aria-labelledby={labelId}
        aria-describedby={hintId}
        aria-busy={saving || undefined}
        disabled={disabled}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors duration-200",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-800",
          shown ? "bg-slate-900" : "bg-slate-300",
          saving && "opacity-60",
          disabled && !saving && "cursor-not-allowed",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform duration-200",
            shown ? "translate-x-5" : "translate-x-0.5",
          )}
        />
        {saving ? <span className="sr-only">Saving</span> : null}
      </button>
    </div>
  );
}
