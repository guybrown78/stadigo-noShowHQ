type Segment = {
  label: string;
  count: number;
  className: string;
};

export function CountBar({
  cancellation,
  awol,
  sickness = 0,
  includeSickness = true,
  className,
}: {
  cancellation: number;
  awol: number;
  sickness?: number;
  includeSickness?: boolean;
  className?: string;
}) {
  const segments: Segment[] = [
    { label: "Cancellation", count: cancellation, className: "bg-cancel" },
    { label: "AWOL", count: awol, className: "bg-awol" },
    ...(includeSickness
      ? [{ label: "Sickness", count: sickness, className: "bg-sickness" }]
      : []),
  ];
  const total = segments.reduce((sum, segment) => sum + segment.count, 0);
  if (total === 0) {
    return null;
  }
  const label = segments
    .map((segment) => `${segment.count} ${segment.label}`)
    .join(", ");

  return (
    <div
      className={`flex h-2 overflow-hidden rounded-full bg-slate-100 ${className ?? ""}`}
      role="img"
      aria-label={label}
    >
      {segments.map((segment) =>
        segment.count > 0 ? (
          <span
            key={segment.label}
            className={segment.className}
            style={{ width: `${(segment.count / total) * 100}%` }}
          />
        ) : null,
      )}
    </div>
  );
}
