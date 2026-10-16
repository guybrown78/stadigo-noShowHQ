"use client";

import { useActionState } from "react";
import {
  saveAwolFollowUpAction,
  type SettingsActionState,
} from "@/app/(app)/settings/absence-actions";
import { FormAlert, controlClassName } from "@/components/form";
import { Button } from "@/components/ui/button";

const initialState: SettingsActionState = {};

export function AwolFollowUpForm({
  staffId,
  contact1At,
  contact2At,
  formalProcessAt,
}: {
  staffId: string;
  contact1At: string;
  contact2At: string;
  formalProcessAt: string;
}) {
  const [state, action, pending] = useActionState(
    saveAwolFollowUpAction,
    initialState,
  );

  return (
    <section className="mt-8 rounded-xl border border-border bg-surface p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">AWOL follow-up</h2>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        Record the first informal contact, the second informal contact, and the
        date a formal process started. These dates are a record only. NoShowHQ
        does not send a message or produce a letter.
      </p>
      <form action={action} className="mt-4 grid max-w-md gap-4">
        <FormAlert>{state.error}</FormAlert>
        {state.ok ? (
          <p className="text-sm text-emerald-800">Follow-up dates saved.</p>
        ) : null}
        <input type="hidden" name="staffId" value={staffId} />
        <DateField name="contact1At" label="Contact 1" defaultValue={contact1At} />
        <DateField name="contact2At" label="Contact 2" defaultValue={contact2At} />
        <DateField
          name="formalProcessAt"
          label="Formal process started"
          defaultValue={formalProcessAt}
        />
        <Button type="submit" disabled={pending}>
          Save follow-up
        </Button>
      </form>
    </section>
  );
}

function DateField({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue: string;
}) {
  return (
    <label className="text-sm font-medium text-slate-700">
      {label}
      <input
        name={name}
        type="date"
        defaultValue={defaultValue}
        className={controlClassName("mt-1 block w-full")}
      />
    </label>
  );
}
