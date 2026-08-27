export function FormAlert({
  children,
}: {
  children?: string;
}) {
  if (!children) return null;
  return (
    <p
      className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
      role="alert"
    >
      {children}
    </p>
  );
}

export function FormSuccess({
  children,
}: {
  children?: string;
}) {
  if (!children) return null;
  return (
    <p
      className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
      role="status"
    >
      {children}
    </p>
  );
}

export function FieldError({
  id,
  messages,
}: {
  id: string;
  messages?: string[];
}) {
  if (!messages?.length) return null;
  return (
    <p id={id} className="mt-1 text-sm text-red-700">
      {messages[0]}
    </p>
  );
}

export function controlClassName(extra = "") {
  return [
    "rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none ring-slate-400 focus:ring-2",
    "aria-invalid:border-red-500 aria-invalid:ring-red-400 aria-invalid:focus:ring-red-400",
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}
