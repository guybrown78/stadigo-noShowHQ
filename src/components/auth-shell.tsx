import Link from "next/link";

export function AuthShell({
  title,
  children,
  footer,
}: {
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center bg-slate-100 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link
            href="/login"
            className="text-2xl font-semibold tracking-tight text-slate-900"
          >
            NoShowHQ
          </Link>
          <h1 className="mt-4 text-xl font-medium text-slate-800">{title}</h1>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          {children}
        </div>
        {footer ? (
          <div className="mt-4 text-center text-sm text-slate-600">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
