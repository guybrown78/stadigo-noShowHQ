"use client";

import { useActionState } from "react";
import {
  confirmImportVenuesAction,
  type ImportActionState,
} from "@/app/(app)/events/import/actions";
import { PendingSubmit } from "@/components/events/pending-submit";
import { FormAlert, selectControlClassName } from "@/components/form";

export type VenueChoiceOption = {
  id: string;
  identifier: string;
  name: string;
  code: string | null;
  active: boolean;
};

export type VenueChoiceRow = {
  id: string;
  importedName: string;
  typed: string[];
  address: string | null;
  count: number;
  note: string | null;
  defaultChoice: string;
  allowNew: boolean;
};

export function ConfirmVenuesForm({
  importId,
  rows,
  venues,
  newVenueCount,
  eventCount,
}: {
  importId: string;
  rows: VenueChoiceRow[];
  venues: VenueChoiceOption[];
  newVenueCount: number;
  eventCount: number;
}) {
  const [state, action] = useActionState(
    confirmImportVenuesAction,
    {} as ImportActionState,
  );

  return (
    <form action={action} className="mt-8 space-y-6" noValidate>
      <input type="hidden" name="importId" value={importId} />
      <FormAlert>{state.error}</FormAlert>
      <section>
        <h2 className="text-lg font-semibold text-slate-900">Check each venue</h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          The file can name a venue by its ID, its name, or its code. Choose
          the saved venue to use, or create a new one. Events are not saved
          until the next step.
        </p>
        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No venues in this file.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">In the file</th>
                  <th className="px-4 py-3 font-medium">Use this venue</th>
                  <th className="px-4 py-3 font-medium">Events</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 align-top">
                    <td className="px-4 py-3 text-slate-900">
                      <div className="font-medium">{row.typed.join(", ") || row.importedName}</div>
                      {row.address ? (
                        <div className="mt-1 text-xs text-slate-500">{row.address}</div>
                      ) : null}
                      {row.note ? (
                        <div className="mt-1 text-xs text-amber-800">{row.note}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <label className="sr-only" htmlFor={`venue-choice-${row.id}`}>
                        Venue for {row.importedName}
                      </label>
                      <select
                        id={`venue-choice-${row.id}`}
                        name={`venueChoice-${row.id}`}
                        defaultValue={row.defaultChoice}
                        className={selectControlClassName("w-full min-w-64")}
                      >
                        {row.allowNew ? (
                          <option value="new">Create new venue “{row.importedName}”</option>
                        ) : (
                          <option value="">Choose a saved venue</option>
                        )}
                        {venues.map((venue) => (
                          <option key={venue.id} value={venue.id}>
                            {venue.identifier} · {venue.name}
                            {venue.code ? ` · ${venue.code}` : ""}
                            {venue.active ? "" : " · Inactive"}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <div className="flex flex-wrap items-start gap-4">
        <div className="space-y-3">
          <PendingSubmit
            pendingLabel={
              newVenueCount > 0 ? "Creating venues…" : "Saving venue confirmation…"
            }
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"
          >
            {newVenueCount > 0
              ? `Confirm venues and continue`
              : `Confirm ${eventCount} ${eventCount === 1 ? "event" : "events"} will use these venues`}
          </PendingSubmit>
          <p className="text-xs text-slate-500">
            This does not create events. Events are created only after the final
            confirmation.
          </p>
        </div>
      </div>
    </form>
  );
}
