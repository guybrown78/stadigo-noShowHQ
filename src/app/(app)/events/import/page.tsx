import Link from "next/link";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { ImportStepper } from "@/components/events/import-stepper";
import { ImportUploadForm } from "@/components/events/import-upload-form";
import { ensureTenantEventCatalog } from "@/lib/events/provision";

export const metadata = { title: "Import events" };
export const maxDuration = 120;

export default async function ImportEventsStartPage() {
  const user = await requireTenant();
  await ensureTenantEventCatalog(prisma, user.tenantId);

  return (
    <div>
      <p className="text-sm text-slate-500">
        <Link href="/events" className="hover:underline">
          Events
        </Link>
        <span aria-hidden="true"> / </span>
        Import
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
        Import events
      </h1>
      <p className="mt-2 max-w-2xl text-slate-600">
        Populate a standard spreadsheet and import a season or programme in one
        controlled process. NoShowHQ checks every row and every venue before
        anything is created.
      </p>
      <ImportStepper current="upload" />

      <div className="mt-8 space-y-6">
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-900">
            1. Download the template
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-600">
            <li>Download and populate the template offline.</li>
            <li>Use event types and subtypes exactly as listed in the template.</li>
            <li>Enter venue names consistently so the same place is recognised as one venue.</li>
            <li>The system will check all venues before creating events.</li>
            <li>New venues require confirmation and are created before events.</li>
            <li>No event is created until you confirm the final preview in NoShowHQ.</li>
          </ul>
          {/* File download from a route handler, not client navigation. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/events/import/template"
            className="mt-4 inline-flex rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Download template
          </a>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-900">
            2. Upload the completed file
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Uploading only checks the file. It does not create venues or events.
          </p>
          <div className="mt-4">
            <ImportUploadForm />
          </div>
        </section>
      </div>
    </div>
  );
}
