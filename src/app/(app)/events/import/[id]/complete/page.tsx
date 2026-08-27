import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EventImportStatus } from "@prisma/client";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { EventAccessError } from "@/lib/events/errors";
import {
  getImportForTenant,
  parseRowNormalized,
} from "@/lib/events/import/queries";
import { eventsListHref } from "@/lib/events/url";

export const metadata = { title: "Import complete" };

export default async function ImportCompletePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireTenant();
  const { id } = await params;

  let record;
  try {
    record = await getImportForTenant(prisma, user.tenantId, id);
  } catch (error) {
    if (error instanceof EventAccessError) {
      notFound();
    }
    throw error;
  }

  if (record.status !== EventImportStatus.COMPLETED) {
    redirect(`/events/import/${id}`);
  }

  const dates = record.rows
    .map((row) => parseRowNormalized(row.normalized)?.eventDate)
    .filter((value): value is string => Boolean(value))
    .sort();
  const from = dates[0] ?? "";
  const to = dates[dates.length - 1] ?? "";

  return (
      <div>
        <p className="text-sm text-slate-500">
          <Link href="/events" className="hover:underline">
            Events
          </Link>
          <span aria-hidden="true"> / </span>
          Import complete
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          Import complete
        </h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          {record.createdEventCount}{" "}
          {record.createdEventCount === 1 ? "event was" : "events were"} created
          {record.createdVenueCount > 0
            ? ` and ${record.createdVenueCount} ${record.createdVenueCount === 1 ? "new venue was" : "new venues were"} added`
            : ""}
          . These are new event records only.
        </p>

        <dl className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Events created
            </dt>
            <dd className="mt-1 text-2xl font-semibold text-slate-900">
              {record.createdEventCount}
            </dd>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              New venues created
            </dt>
            <dd className="mt-1 text-2xl font-semibold text-slate-900">
              {record.createdVenueCount}
            </dd>
          </div>
        </dl>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href={eventsListHref({}, { from, to, page: 1 })}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            View imported events
          </Link>
          <Link
            href="/events/import"
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            Start another import
          </Link>
        </div>
      </div>
    );
}
