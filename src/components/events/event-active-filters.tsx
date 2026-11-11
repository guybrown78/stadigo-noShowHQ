import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { formatLocalDateDisplay, parseLocalDate } from "@/lib/events/dates";
import { EVENT_STATUS_LABELS } from "@/lib/events/display";
import type { EventListQuery } from "@/lib/events/schema";
import { eventsListHref } from "@/lib/events/url";

type Chip = {
  key: string;
  label: string;
  href: string;
  removeLabel: string;
};

function dropHref(query: EventListQuery, overrides: Partial<EventListQuery>) {
  return eventsListHref(query, { ...overrides, page: 1 });
}

function formatBound(value: string) {
  const date = parseLocalDate(value);
  return date ? formatLocalDateDisplay(date) : value;
}

const RANGE_LABELS = {
  all: "All",
  past: "Past",
  archived: "Archived",
} as const;

export function EventActiveFilters({
  query,
  typeName,
}: {
  query: EventListQuery;
  typeName?: string;
}) {
  const chips: Chip[] = [];
  if (query.q) {
    chips.push({
      key: "q",
      label: `Search · ${query.q}`,
      href: dropHref(query, { q: "" }),
      removeLabel: `Remove search ${query.q}`,
    });
  }
  if (query.status) {
    const label = `Status · ${EVENT_STATUS_LABELS[query.status]}`;
    chips.push({
      key: "status",
      label,
      href: dropHref(query, { status: "" }),
      removeLabel: `Remove ${label}`,
    });
  }
  if (query.type) {
    const label = `Type · ${typeName || "Event type"}`;
    chips.push({
      key: "type",
      label,
      href: dropHref(query, { type: "" }),
      removeLabel: `Remove ${label}`,
    });
  }
  if (query.from) {
    const label = `From · ${formatBound(query.from)}`;
    chips.push({
      key: "from",
      label,
      href: dropHref(query, { from: "" }),
      removeLabel: `Remove ${label}`,
    });
  }
  if (query.to) {
    const label = `To · ${formatBound(query.to)}`;
    chips.push({
      key: "to",
      label,
      href: dropHref(query, { to: "" }),
      removeLabel: `Remove ${label}`,
    });
  }
  if (query.range !== "upcoming") {
    const label = `When · ${RANGE_LABELS[query.range]}`;
    chips.push({
      key: "when",
      label,
      href: dropHref(query, { range: "upcoming" }),
      removeLabel: `Remove ${label}`,
    });
  }

  if (chips.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ul className="flex flex-wrap gap-2" aria-label="Active filters">
        {chips.map((chip) => (
          <li key={chip.key}>
            <Link
              href={chip.href}
              aria-label={chip.removeLabel}
              className="inline-flex items-center gap-1 rounded-full bg-primary-soft py-1 pr-2 pl-3 text-sm font-medium text-primary-hover hover:underline"
            >
              <span>{chip.label}</span>
              <span aria-hidden="true">×</span>
            </Link>
          </li>
        ))}
      </ul>
      <ButtonLink href="/events" variant="secondary" size="sm">
        Clear filters
      </ButtonLink>
    </div>
  );
}
