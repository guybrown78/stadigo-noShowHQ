import { formatAdminTimestamp } from "@/lib/user-activity";

export function AdminActivitySummary({
  lastLoggedInAt,
  lastActiveAt,
}: {
  lastLoggedInAt: Date | null;
  lastActiveAt: Date | null;
}) {
  return (
    <p className="text-sm text-slate-600">
      Last signed in{" "}
      <span className="font-medium text-slate-800">
        {formatAdminTimestamp(lastLoggedInAt)}
      </span>
      <span className="text-slate-400"> · </span>
      Last activity{" "}
      <span className="font-medium text-slate-800">
        {formatAdminTimestamp(lastActiveAt)}
      </span>
    </p>
  );
}
