import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EventImportStatus, EventImportVenueOutcome } from "@prisma/client";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { CancelImportForm } from "@/components/events/cancel-import-form";
import { ConfirmEventsForm } from "@/components/events/confirm-events-form";
import { ImportStepper } from "@/components/events/import-stepper";
import { EVENT_STATUS_LABELS } from "@/lib/events/display";
import { EventAccessError } from "@/lib/events/errors";
import {
  getImportForTenant,
  listValidImportPreview,
  parseRowNormalized,
} from "@/lib/events/import/queries";
import { importConfirmHref } from "@/lib/events/url";

export const metadata = { title: "Create imported events" };
export const maxDuration = 120;

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function ImportConfirmPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireTenant();
  const { id } = await params;
  const rawQuery = await searchParams;
  const page = Number(first(rawQuery.page) || "1") || 1;

  let record;
  try {
    record = await getImportForTenant(prisma, user.tenantId, id);
  } catch (error) {
    if (error instanceof EventAccessError) {
      notFound();
    }
    throw error;
  }

  const confirmable =
    record.status === EventImportStatus.AWAITING_EVENT_CONFIRMATION ||
    record.status === EventImportStatus.VENUES_CONFIRMED ||
    (record.status === EventImportStatus.FAILED &&
      record.createdEventCount === 0 &&
      Boolean(record.venueConfirmedAt));
  if (!confirmable) {
    redirect(`/events/import/${id}`);
  }

  const preview = await listValidImportPreview(
    prisma,
    user.tenantId,
    id,
    page,
  );
    const venueNameByKey = new Map(
      record.venues.map((venue) => [
        venue.nameNormalized,
        venue.createdVenue?.name ??
          venue.matchedVenue?.name ??
          venue.importedName,
      ]),
    );
    const typeCounts = new Map<string, number>();
    const statusCounts = new Map<string, number>();
    const dates: string[] = [];
    for (const row of record.rows) {
      if (row.status !== "VALID") continue;
      const normalized = parseRowNormalized(row.normalized);
      if (!normalized) continue;
      typeCounts.set(
        normalized.eventTypeLabel,
        (typeCounts.get(normalized.eventTypeLabel) ?? 0) + 1,
      );
      statusCounts.set(
        normalized.status,
        (statusCounts.get(normalized.status) ?? 0) + 1,
      );
      dates.push(normalized.eventDate);
    }
    dates.sort();
    const createdVenues = record.venues.filter((venue) => venue.createdVenueId);
    const existingUsed = record.venues.filter(
      (venue) =>
        venue.outcome === EventImportVenueOutcome.MATCHED ||
        (venue.matchedVenueId && !venue.createdVenueId),
    );

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
          Create events
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          Create imported events
        </h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          Review the events that will be created. This creates new events only.
          It does not update existing events, create staff bookings, or
          calculate staffing risk.
        </p>
        <ImportStepper current="events" />

        {record.status === EventImportStatus.FAILED ? (
          <p className="mt-6 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            The previous create attempt did not keep any imported events. You can
            try creating them again.
          </p>
        ) : null}

        <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="Events to create" value={record.validRows} />
          <SummaryCard label="Existing venues used" value={existingUsed.length} />
          <SummaryCard label="New venues created" value={createdVenues.length} />
          <SummaryCard
            label="Date range"
            value={
              dates.length > 0 ? `${dates[0]} to ${dates[dates.length - 1]}` : "—"
            }
          />
        </dl>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <CountList
            title="By event type"
            items={[...typeCounts.entries()].map(([label, count]) => ({
              label,
              count,
            }))}
          />
          <CountList
            title="By status"
            items={[...statusCounts.entries()].map(([status, count]) => ({
              label:
                EVENT_STATUS_LABELS[
                  status as keyof typeof EVENT_STATUS_LABELS
                ] ?? status,
              count,
            }))}
          />
        </div>

        <p className="mt-6 text-sm text-slate-500">
          Showing {preview.rows.length} of {preview.total} events
          {preview.pageCount > 1
            ? ` · Page ${preview.page} of ${preview.pageCount}`
            : ""}
        </p>
        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">Event</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Venue</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Staff</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((row) => {
                const normalized = parseRowNormalized(row.normalized);
                return (
                  <tr key={row.id} className="border-b border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {normalized?.name ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                      {normalized?.eventDate ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {row.venueKey
                        ? (venueNameByKey.get(row.venueKey) ?? "—")
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {normalized
                        ? `${normalized.eventTypeLabel} / ${normalized.eventSubtypeLabel}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {normalized?.staffRequired ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {normalized
                        ? EVENT_STATUS_LABELS[normalized.status]
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {preview.pageCount > 1 ? (
          <div className="mt-4 flex gap-2">
            {preview.page > 1 ? (
              <Link
                href={importConfirmHref(id, { page: preview.page - 1 })}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-50"
              >
                Previous
              </Link>
            ) : null}
            {preview.page < preview.pageCount ? (
              <Link
                href={importConfirmHref(id, { page: preview.page + 1 })}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-50"
              >
                Next
              </Link>
            ) : null}
          </div>
        ) : null}

        <div className="mt-8 flex flex-wrap items-start gap-4">
          <ConfirmEventsForm importId={id} eventCount={record.validRows} />
          <CancelImportForm importId={id} />
        </div>
      </div>
    );
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 text-2xl font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

function CountList({
  title,
  items,
}: {
  title: string;
  items: { label: string; count: number }[];
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <ul className="mt-2 space-y-1 text-sm text-slate-700">
        {items.map((item) => (
          <li key={item.label} className="flex justify-between gap-3">
            <span>{item.label}</span>
            <span>{item.count}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
