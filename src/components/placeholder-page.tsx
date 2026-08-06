export function PlaceholderPage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        {title}
      </h1>
      <p className="mt-2 max-w-2xl text-slate-600">{description}</p>
      <div className="mt-8 rounded-lg border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
        <p className="text-sm font-medium text-slate-800">Nothing here yet</p>
        <p className="mt-1 text-sm text-slate-500">
          This area is a placeholder for a future NoShowHQ module.
        </p>
      </div>
    </div>
  );
}
