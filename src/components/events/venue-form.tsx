"use client";

import { useActionState, useId, useMemo } from "react";
import {
  createVenueAction,
  updateVenueAction,
  type VenueActionState,
} from "@/app/(app)/settings/actions";
import { FieldError, FormAlert, controlClassName } from "@/components/form";
import { parseVenueFormData } from "@/lib/events/schema";
import { withClientValidation } from "@/lib/form";

export type VenueFormInitialValues = {
  name?: string;
  addressLine1?: string | null;
  townCity?: string | null;
  postcode?: string | null;
  active?: boolean;
};

const initialState: VenueActionState = {};

export function VenueForm({
  mode,
  venueId,
  initialValues,
}: {
  mode: "create" | "edit";
  venueId?: string;
  initialValues?: VenueFormInitialValues;
}) {
  const action = mode === "create" ? createVenueAction : updateVenueAction;
  const validatedAction = useMemo(
    () => withClientValidation(parseVenueFormData, action),
    [action],
  );
  const [state, formAction, pending] = useActionState(
    validatedAction,
    initialState,
  );
  const formId = useId();

  function errorId(name: string) {
    return `${formId}-${name}-error`;
  }

  return (
    <form action={formAction} className="max-w-xl space-y-4" noValidate>
      {venueId ? <input type="hidden" name="venueId" value={venueId} /> : null}
      {mode === "create" ? (
        <input type="hidden" name="active" value="on" />
      ) : null}

      <FormAlert>{state.error}</FormAlert>

      <div>
        <label
          htmlFor={`${formId}-name`}
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          Venue name <span className="text-red-700">*</span>
        </label>
        <input
          id={`${formId}-name`}
          name="name"
          required
          minLength={2}
          maxLength={160}
          defaultValue={initialValues?.name ?? ""}
          aria-required="true"
          aria-invalid={Boolean(state.fieldErrors?.name)}
          aria-describedby={state.fieldErrors?.name ? errorId("name") : undefined}
          className={controlClassName("w-full")}
        />
        <FieldError id={errorId("name")} messages={state.fieldErrors?.name} />
      </div>

      <div>
        <label
          htmlFor={`${formId}-address`}
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          Address line
        </label>
        <input
          id={`${formId}-address`}
          name="addressLine1"
          maxLength={160}
          defaultValue={initialValues?.addressLine1 ?? ""}
          aria-invalid={Boolean(state.fieldErrors?.addressLine1)}
          aria-describedby={
            state.fieldErrors?.addressLine1 ? errorId("address") : undefined
          }
          className={controlClassName("w-full")}
        />
        <FieldError
          id={errorId("address")}
          messages={state.fieldErrors?.addressLine1}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor={`${formId}-town`}
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Town / city
          </label>
          <input
            id={`${formId}-town`}
            name="townCity"
            maxLength={120}
            defaultValue={initialValues?.townCity ?? ""}
            aria-invalid={Boolean(state.fieldErrors?.townCity)}
            aria-describedby={
              state.fieldErrors?.townCity ? errorId("town") : undefined
            }
            className={controlClassName("w-full")}
          />
          <FieldError
            id={errorId("town")}
            messages={state.fieldErrors?.townCity}
          />
        </div>
        <div>
          <label
            htmlFor={`${formId}-postcode`}
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Postcode
          </label>
          <input
            id={`${formId}-postcode`}
            name="postcode"
            autoComplete="postal-code"
            defaultValue={initialValues?.postcode ?? ""}
            aria-invalid={Boolean(state.fieldErrors?.postcode)}
            aria-describedby={
              state.fieldErrors?.postcode ? errorId("postcode") : undefined
            }
            className={controlClassName("w-full")}
          />
          <FieldError
            id={errorId("postcode")}
            messages={state.fieldErrors?.postcode}
          />
        </div>
      </div>

      {mode === "edit" ? (
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="active"
            defaultChecked={initialValues?.active !== false}
            className="mt-0.5 rounded border-slate-300"
          />
          <span>
            Active
            <span className="mt-0.5 block text-xs text-slate-500">
              Inactive venues stay on past events but are hidden from the add
              event form.
            </span>
          </span>
        </label>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending
          ? mode === "create"
            ? "Adding…"
            : "Saving…"
          : mode === "create"
            ? "Add venue"
            : "Save changes"}
      </button>
    </form>
  );
}
