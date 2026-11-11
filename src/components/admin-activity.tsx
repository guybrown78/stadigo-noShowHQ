import { formatAdminTimestamp } from "@/lib/user-activity";

export function AdminActivitySummary({
  lastLoggedInAt,
  lastActiveAt,
}: {
  lastLoggedInAt: Date | null;
  lastActiveAt: Date | null;
}) {
  return (
    <p className="text-sm text-muted">
      Last signed in{" "}
      <span className="font-medium text-foreground">
        {formatAdminTimestamp(lastLoggedInAt)}
      </span>
      <span className="text-muted"> · </span>
      Last activity{" "}
      <span className="font-medium text-foreground">
        {formatAdminTimestamp(lastActiveAt)}
      </span>
    </p>
  );
}
