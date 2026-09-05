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
      className="rounded-md border border-primary/20 bg-primary-soft px-3 py-2 text-sm text-primary-hover"
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
    "rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none ring-primary/30 focus:border-primary focus:ring-2",
    "aria-invalid:border-red-500 aria-invalid:ring-red-400 aria-invalid:focus:ring-red-400",
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Compact controls for list-page filter toolbars. */
export function filterControlClassName(extra = "") {
  return [
    "w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none ring-primary/30 focus:border-primary focus:ring-2",
    "aria-invalid:border-red-500 aria-invalid:ring-red-400 aria-invalid:focus:ring-red-400",
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}
