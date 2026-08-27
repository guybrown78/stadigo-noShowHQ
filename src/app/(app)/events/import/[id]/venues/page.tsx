import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EventImportStatus, EventImportVenueOutcome } from "@prisma/client";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { CancelImportForm } from "@/components/events/cancel-import-form";
import { ConfirmVenuesForm } from "@/components/events/confirm-venues-form";
import { ImportStepper } from "@/components/events/import-stepper";
import { formatVenueAddress } from "@/lib/events/display";
import { EventAccessError } from "@/lib/events/errors";
import { getImportForTenant } from "@/lib/events/import/queries";

export const metadata = { title: "Confirm venues" };
export const maxDuration = 120;

export default async function ImportVenuesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireTenant();
  const { id } = await params;
  const raw = await searchParams;
  const repeat = (Array.isArray(raw.repeat) ? raw.repeat[0] : raw.repeat) === "1";

  let record;
  try {
    record = await getImportForTenant(prisma, user.tenantId, id);
  } catch (error) {
    if (error instanceof EventAccessError) {
      notFound();
    }
    throw error;
  }

  if (record.status !== EventImportStatus.AWAITING_VENUE_CONFIRMATION) {
    redirect(`/events/import/${id}`);
  }

  const newVenues = record.venues.filter(
    (venue) => venue.outcome === EventImportVenueOutcome.NEW,
  );
  const matchedVenues = record.venues.filter(
    (venue) => venue.outcome === EventImportVenueOutcome.MATCHED,
  );
  const hasNew = newVenues.length > 0;

  return (
      <div>
        <p className="text-sm text-slate-500">
          <Link href="/events" className="hover:underline">
            Events
          </Link>
          <span aria-hidden="true"> / </span>
          <Link href="/events/import" className="hover:underline">
            Import
          </Link>
          <span aria-hidden="true"> / </span>
          Confirm venues
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          {hasNew ? "Review new venues" : "Confirm venues"}
        </h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          {hasNew
            ? `This file will create ${newVenues.length} ${newVenues.length === 1 ? "new venue" : "new venues"} and then ${record.validRows} ${record.validRows === 1 ? "event" : "events"} after the next step. Confirm the venue set first. No events are created yet.`
            : `Every venue in this file already exists. Confirm these mappings before ${record.validRows} ${record.validRows === 1 ? "event is" : "events are"} created.`}
        </p>
        <ImportStepper current="venues" />

        {repeat ? (
          <p className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
            This file matches a previous completed import. Check you are not
            adding the same programme twice.
          </p>
        ) : null}

        <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="Events to create" value={record.validRows} />
          <SummaryCard label="Matched existing venues" value={matchedVenues.length} />
          <SummaryCard label="New venues to create" value={newVenues.length} />
          <SummaryCard label="Rows with errors" value={record.invalidRows} />
        </dl>

        {hasNew ? (
          <VenueTable
            title="New venues to create"
            empty="No new venues."
            rows={newVenues.map((venue) => ({
              id: venue.id,
              name: venue.importedName,
              kind: "New venue",
              address: formatVenueAddress(venue),
              note: null,
              count: venue.eventRowCount,
            }))}
          />
        ) : null}

        <VenueTable
          title="Existing venues matched"
          empty="No existing venues were matched."
          rows={matchedVenues.map((venue) => ({
            id: venue.id,
            name: venue.matchedVenue?.name ?? venue.importedName,
            kind: "Existing venue matched",
            address: formatVenueAddress(venue.matchedVenue ?? venue),
            note: venue.inactiveMatch
              ? "Currently inactive. Confirming will reuse and reactivate it."
              : null,
            count: venue.eventRowCount,
          }))}
        />

        <div className="mt-8 flex flex-wrap items-start gap-4">
          <ConfirmVenuesForm
            importId={id}
            newVenueCount={newVenues.length}
            eventCount={record.validRows}
          />
          <CancelImportForm importId={id} />
        </div>
      </div>
    );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 text-2xl font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

function VenueTable({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: {
    id: string;
    name: string;
    kind: string;
    address: string | null;
    note: string | null;
    count: number;
  }[];
}) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">{empty}</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">Venue</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">Events</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 align-top">
                  <td className="px-4 py-3 text-slate-900">
                    <div className="font-medium">{row.name}</div>
                    {row.note ? (
                      <div className="mt-1 text-xs text-amber-800">{row.note}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{row.kind}</td>
                  <td className="px-4 py-3 text-slate-600">{row.address ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-700">{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
