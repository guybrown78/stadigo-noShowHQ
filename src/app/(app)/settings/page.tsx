import Link from "next/link";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Settings
      </h1>
      <p className="mt-2 max-w-2xl text-slate-600">
        Configure organisation defaults and preferences that NoShowHQ will use
        across this tenant.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Link
          href="/settings/events"
          className="rounded-lg border border-slate-200 bg-white p-5 hover:border-slate-300 hover:bg-slate-50"
        >
          <h2 className="text-base font-semibold text-slate-900">
            Venues
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Manage venues used when creating or importing events. You can also
            open this list from Events.
          </p>
        </Link>
      </div>
    </div>
  );
}
