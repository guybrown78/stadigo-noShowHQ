"use client";

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
  returnTo,
}: {
  absenceId: string;
  unauthorised: boolean;
  archived: boolean;
  returnTo?: string;
}) {
  const [state, formAction, pending] = useActionState(
    setCancellationUnauthorisedAction,
    initialState,
  );
  const pressed = unauthorised;
  const className = cn(
    "w-full rounded-xl border px-4 py-3 text-left",
    pressed
      ? "border-slate-800 bg-slate-800 text-white"
      : "border-border bg-surface text-slate-900",
    archived ? "cursor-default" : "hover:border-slate-400",
    pending && "opacity-70",
  );
  const status = pressed ? "Marked" : "Not marked";
  const hint = archived
    ? "Archived cancellations keep this mark and cannot be changed."
    : pressed
      ? "Click to clear the mark. The record stays a cancellation."
      : "Click to mark that the required information was not provided.";

  const body = (
    <>
      <span className="block text-sm font-semibold">Unauthorised</span>
      <span
        className={cn(
          "mt-1 block text-sm",
          pressed ? "text-slate-100" : "text-slate-600",
        )}
      >
        {status}
      </span>
      <span
        className={cn(
          "mt-1 block text-xs leading-5",
          pressed ? "text-slate-200" : "text-slate-500",
        )}
      >
        {hint}
      </span>
    </>
  );

  if (archived) {
    return (
      <button
        type="button"
        className={className}
        aria-pressed={pressed}
        disabled
      >
        {body}
      </button>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="absenceId" value={absenceId} />
      <input type="hidden" name="unauthorised" value={pressed ? "0" : "1"} />
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      <FormAlert>{state.error}</FormAlert>
      <button
        type="submit"
        className={className}
        aria-pressed={pressed}
        disabled={pending}
      >
        {body}
      </button>
    </form>
  );
}
