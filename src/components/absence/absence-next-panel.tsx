import type { NextWork } from "@/lib/absence/next-work";

export function AbsenceNextPanel({
  work,
  action,
}: {
  work: NextWork;
  action?: React.ReactNode;
}) {
  if (!work.next && work.outstanding.length === 0) {
    return null;
  }

  return (
    <section aria-label={work.next ? "Next" : "Outstanding"}>
      {work.next ? (
        <div>
          <p className="text-sm font-medium text-foreground">Next</p>
          <p className="mt-1 text-sm text-muted">{work.next.label}</p>
          {action ? <div className="mt-3">{action}</div> : null}
        </div>
      ) : null}
      {work.outstanding.length > 0 ? (
        <ul
          className={`list-disc space-y-1 pl-5 text-sm text-muted ${work.next ? "mt-3" : ""}`}
          aria-label="Also outstanding"
        >
          {work.outstanding.map((item) => (
            <li key={`${item.kind}-${item.followUpId ?? item.label}`}>{item.label}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
