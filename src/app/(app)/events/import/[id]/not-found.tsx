import Link from "next/link";

export default function ImportNotFound() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Import not found
      </h1>
      <p className="mt-2 max-w-xl text-slate-600">
        This import is not available. It may have been cancelled, or you may not
        have access to it.
      </p>
      <Link
        href="/events/import"
        className="mt-6 inline-flex rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        Start another import
      </Link>
    </div>
  );
}
