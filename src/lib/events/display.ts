import type { EventStatus } from "@prisma/client";

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  PLANNED: "Planned",
  CONFIRMED: "Confirmed",
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",
};

export const EVENT_STATUS_STYLES: Record<EventStatus, string> = {
  PLANNED: "bg-slate-100 text-slate-800",
  CONFIRMED: "bg-sky-100 text-sky-900",
  CANCELLED: "bg-red-100 text-red-800",
  COMPLETED: "bg-emerald-100 text-emerald-900",
};

export function formatVenueAddress(venue: {
  addressLine1?: string | null;
  townCity?: string | null;
  postcode?: string | null;
}): string | null {
  const parts = [venue.addressLine1, venue.townCity, venue.postcode].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? parts.join(", ") : null;
}
