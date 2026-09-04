import Link from "next/link";
import { requireTenant } from "@/lib/authz";
import { ImportStepper } from "@/components/staff/import-stepper";
import { ImportUploadForm } from "@/components/staff/import-upload-form";

export const metadata = { title: "Import staff" };
export const maxDuration = 120;

export default async function ImportStaffStartPage() {
  await requireTenant();

  return (
    <div>
      <p className="text-sm text-slate-500">
        <Link href="/staff" className="hover:underline">
          Staff
        </Link>
        <span aria-hidden="true"> / </span>
        Import
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
        Import staff
      </h1>
      <p className="mt-2 max-w-2xl text-slate-600">
        Download the Staff template, populate it offline, then upload it here.
        NoShowHQ checks every row before any staff record is created.
      </p>
      <ImportStepper current="upload" />

      <div className="mt-8 space-y-6">
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-900">
            1. Download the template
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-600">
            <li>Download and populate the Staff template.</li>
            <li>
              Use Staff IDs consistently and uniquely. Matching is
              case-insensitive after extra spaces are removed.
            </li>
            <li>
              Manager Staff ID must exactly match an existing Staff ID or an ID
              in the same file. Names are not matched.
            </li>
            <li>
              No staff record is created until the entire file passes checks and
              you confirm the preview.
            </li>
            <li>
              The import creates operational staff records only. It does not
              create logins or send messages.
            </li>
            <li>
              Probation information follows the same rules as adding one staff
              member.
            </li>
          </ul>
          {/* File download from a route handler, not client navigation. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/staff/import/template"
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
            Uploading only checks the file. It does not create staff, manager
            relationships, probation records, or tasks.
          </p>
          <div className="mt-4">
            <ImportUploadForm />
          </div>
        </section>
      </div>
    </div>
  );
}
