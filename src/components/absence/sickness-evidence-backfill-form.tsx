"use client";

import { useActionState, useEffect, useState } from "react";
import {
  applySicknessEvidenceBackfillAction,
  type SicknessEvidenceSettingsActionState,
} from "@/app/(app)/settings/actions";
import { FormAlert } from "@/components/form";

const initialState: SicknessEvidenceSettingsActionState = {};

export function SicknessEvidenceBackfillForm({
  episodes,
}: {
  episodes: number;
}) {
  const [idempotencyKey, setIdempotencyKey] = useState("");
  useEffect(() => {
    setIdempotencyKey(crypto.randomUUID());
  }, []);
  const [state, action, pending] = useActionState(
    applySicknessEvidenceBackfillAction,
    initialState,
  );

  return (
    <form action={action} className="mt-4 space-y-3">
      <FormAlert>{state.error}</FormAlert>
      {state.success ? <p className="text-sm text-slate-700">{state.success}</p> : null}
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input type="checkbox" name="confirmBackfill" value="yes" className="mt-1" />
        <span>
          Apply to {episodes} existing {episodes === 1 ? "episode" : "episodes"}.
        </span>
      </label>
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <button
        type="submit"
        disabled={pending || episodes === 0 || idempotencyKey === ""}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"
      >
        {pending ? "Applying…" : "Apply to existing episodes"}
      </button>
    </form>
  );
}
