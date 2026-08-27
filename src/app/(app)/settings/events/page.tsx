import Link from "next/link";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { formatVenueAddress } from "@/lib/events/display";
import { listVenuesForSettings } from "@/lib/events/queries";
import { ensureTenantEventCatalog } from "@/lib/events/provision";
import { venueListQuerySchema, type VenueListQuery } from "@/lib/events/schema";
import { venueSettingsHref } from "@/lib/events/url";
import { EventsSectionNav } from "@/components/events/events-section-nav";

export const metadata = { title: "Venues" };

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function EventSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireTenant();
  await ensureTenantEventCatalog(prisma, user.tenantId);

  const raw = await searchParams;
  const parsedQuery = venueListQuerySchema.safeParse({
    q: first(raw.q),
    status: first(raw.status),
    page: first(raw.page) || "1",
  });
  const query: VenueListQuery = parsedQuery.success
    ? parsedQuery.data
    : { q: "", status: "", page: 1 };

  const list = await listVenuesForSettings(prisma, user.tenantId, query);
  const { venues, total, page, pageCount } = list;
  const created = first(raw.created) === "1";
  const updated = first(raw.updated) === "1";
  const hasFilters = Boolean(query.q || query.status);

  return (
    <div>
      <p className="text-sm text-slate-500">
        <Link href="/events" className="hover:underline">
          Events
        </Link>
        <span aria-hidden="true"> / </span>
        Venues
      </p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Venues
          </h1>
          <p className="mt-2 max-w-2xl text-slate-600">
            Venues saved here appear when you create, edit, or import events.
            You can also add a venue from the event form if you cannot find it
            in the list.
          </p>
        </div>
        <Link
          href="/settings/events/venues/new"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Add venue
        </Link>
      </div>
      <EventsSectionNav current="venues" />

      {created ? (
        <p
          className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
          role="status"
        >
          Venue added.
        </p>
      ) : null}
      {updated ? (
        <p
          className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
          role="status"
        >
          Venue updated.
        </p>
      ) : null}

      <form
        method="get"
        className="mt-6 space-y-3 rounded-lg border border-slate-200 bg-white p-4"
        aria-label="Filter venues"
      >
        <div className="grid gap-3 md:grid-cols-3">
          <div className="md:col-span-2">
            <label
              htmlFor="venues-q"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Search
            </label>
            <input
              id="venues-q"
              name="q"
              type="search"
              defaultValue={query.q}
              placeholder="Name, address, or postcode"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none ring-slate-400 focus:ring-2"
            />
          </div>
          <div>
            <label
              htmlFor="venues-status"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Status
            </label>
            <select
              id="venues-status"
              name="status"
              defaultValue={query.status}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none ring-slate-400 focus:ring-2"
            >
              <option value="">All venues</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Apply
          </button>
          {hasFilters ? (
            <Link
              href="/settings/events"
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              Clear
            </Link>
          ) : null}
        </div>
      </form>

      {venues.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          {hasFilters ? (
            <>
              <p className="text-sm font-medium text-slate-800">
                No venues match these filters
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Try a different search, or clear the filters to see all venues.
              </p>
              <Link
                href="/settings/events"
                className="mt-4 inline-flex rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
              >
                Clear filters
              </Link>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-slate-800">No venues yet</p>
              <p className="mt-1 text-sm text-slate-500">
                Add a venue so it can be selected when you create an event.
              </p>
              <Link
                href="/settings/events/venues/new"
                className="mt-4 inline-flex rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                Add your first venue
              </Link>
            </>
          )}
        </div>
      ) : (
        <>
          <p className="mt-6 text-sm text-slate-500">
            {total} {total === 1 ? "venue" : "venues"}
            {pageCount > 1 ? ` · Page ${page} of ${pageCount}` : ""}
          </p>

          <div className="mt-3 hidden overflow-hidden rounded-lg border border-slate-200 bg-white md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Venue</th>
                  <th className="px-4 py-3 font-medium">Address</th>
                  <th className="px-4 py-3 font-medium">Events</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {venues.map((venue) => (
                  <tr key={venue.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {venue.name}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {formatVenueAddress(venue) ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {venue._count.events}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          venue.active
                            ? "bg-emerald-100 text-emerald-900"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {venue.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/settings/events/venues/${venue.id}/edit`}
                        className="font-medium text-slate-800 underline hover:text-slate-950"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="mt-3 space-y-3 md:hidden">
            {venues.map((venue) => (
              <li
                key={venue.id}
                className="rounded-lg border border-slate-200 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">{venue.name}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {formatVenueAddress(venue) ?? "No address"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {venue._count.events}{" "}
                      {venue._count.events === 1 ? "event" : "events"}
                      {" · "}
                      {venue.active ? "Active" : "Inactive"}
                    </p>
                  </div>
                  <Link
                    href={`/settings/events/venues/${venue.id}/edit`}
                    className="text-sm font-medium text-slate-800 underline"
                  >
                    Edit
                  </Link>
                </div>
              </li>
            ))}
          </ul>

          {pageCount > 1 ? (
            <nav
              className="mt-6 flex flex-wrap items-center gap-2"
              aria-label="Venue pagination"
            >
              {page > 1 ? (
                <Link
                  href={venueSettingsHref(query, { page: page - 1 })}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
                >
                  Previous
                </Link>
              ) : null}
              {page < pageCount ? (
                <Link
                  href={venueSettingsHref(query, { page: page + 1 })}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
                >
                  Next
                </Link>
              ) : null}
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
