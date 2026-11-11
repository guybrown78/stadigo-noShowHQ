export function FormAlert({
  children,
}: {
  children?: string;
}) {
  if (!children) return null;
  return (
    <p
      className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-800"
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
      className="rounded-lg border border-primary/20 bg-primary-soft px-3 py-2 text-sm leading-6 text-primary-hover"
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
    "rounded-md border border-border bg-surface px-3 py-2 text-foreground transition-colors",
    "focus:border-primary",
    "aria-invalid:border-red-500",
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Select controls with the arrow inset from the border. */
export function selectControlClassName(extra = "") {
  return controlClassName(`field-select ${extra}`);
}

/** Compact controls for list-page filter toolbars. */
export function filterControlClassName(extra = "") {
  return [
    "w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-foreground transition-colors focus:border-primary",
    "aria-invalid:border-red-500",
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}
