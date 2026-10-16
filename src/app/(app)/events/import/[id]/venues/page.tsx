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
import { getImportForTenant, parseRowRaw } from "@/lib/events/import/queries";

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

  const savedVenues = await prisma.venue.findMany({
    where: { tenantId: user.tenantId },
    select: {
      id: true,
      identifier: true,
      name: true,
      nameNormalized: true,
      code: true,
      active: true,
    },
    orderBy: [{ name: "asc" }],
  });
  const savedNames = new Set(savedVenues.map((venue) => venue.nameNormalized));
  const newVenues = record.venues.filter(
    (venue) => venue.outcome === EventImportVenueOutcome.NEW,
  );
  const matchedVenues = record.venues.filter(
    (venue) => venue.outcome === EventImportVenueOutcome.MATCHED,
  );
  const hasNew = newVenues.length > 0;
  const choiceRows = record.venues.map((venue) => {
    const typed = [
      ...new Set(
        record.rows
          .filter((row) => row.venueKey === venue.nameNormalized)
          .map((row) => parseRowRaw(row.raw)["Venue Name"].trim())
          .filter(Boolean),
      ),
    ];
    const allowNew =
      venue.outcome !== EventImportVenueOutcome.AMBIGUOUS &&
      !savedNames.has(venue.nameNormalized);
    return {
      id: venue.id,
      importedName: venue.importedName,
      typed,
      address: formatVenueAddress(venue.matchedVenue ?? venue),
      count: venue.eventRowCount,
      note:
        venue.outcome === EventImportVenueOutcome.AMBIGUOUS
          ? "These rows do not agree. Choose the saved venue to use."
          : venue.inactiveMatch
            ? "Currently inactive. Confirming will reuse and reactivate it."
            : null,
      defaultChoice: allowNew
        ? venue.matchedVenueId ?? "new"
        : venue.matchedVenueId ?? "",
      allowNew,
    };
  });

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

        <ConfirmVenuesForm
          importId={id}
          rows={choiceRows}
          venues={savedVenues}
          newVenueCount={newVenues.length}
          eventCount={record.validRows}
        />
        <div className="mt-4">
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

