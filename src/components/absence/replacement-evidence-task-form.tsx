"use client";

import { useActionState, useEffect, useState } from "react";
import {
  createReplacementEvidenceTaskAction,
  type EvidenceActionState,
} from "@/app/(app)/absence/evidence-actions";
import { FormAlert } from "@/components/form";

const initialState: EvidenceActionState = {};

export function ReplacementEvidenceTaskForm({
  absenceId,
  purpose,
  fitNoteId,
  label,
  returnTo,
}: {
  absenceId: string;
  purpose: "REQUEST_FIT_NOTE" | "CHASE_FIT_NOTE";
  fitNoteId?: string;
  label: string;
  returnTo?: string;
}) {
  const [idempotencyKey, setIdempotencyKey] = useState("");
  useEffect(() => {
    setIdempotencyKey(crypto.randomUUID());
  }, []);
  const [state, action, pending] = useActionState(
    createReplacementEvidenceTaskAction,
    initialState,
  );

  return (
    <form action={action} className="mt-2">
      <FormAlert>{state.error}</FormAlert>
      <input type="hidden" name="absenceId" value={absenceId} />
      <input type="hidden" name="purpose" value={purpose} />
      <input type="hidden" name="fitNoteId" value={fitNoteId ?? ""} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      <button
        type="submit"
        disabled={pending || idempotencyKey === ""}
        className="text-sm font-medium text-primary hover:text-primary-hover disabled:opacity-60"
      >
        {pending ? "Creating…" : label}
      </button>
    </form>
  );
}
