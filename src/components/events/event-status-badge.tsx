import type { EventStatus } from "@prisma/client";
import { EVENT_STATUS_LABELS, EVENT_STATUS_STYLES } from "@/lib/events/display";

export function EventStatusBadge({ status }: { status: EventStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${EVENT_STATUS_STYLES[status]}`}
    >
      {EVENT_STATUS_LABELS[status]}
    </span>
  );
}
