import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { ABSENCE_TYPE_LABELS } from "@/lib/absence/display";
import { FOLLOW_UP_DUE_LABELS } from "@/lib/absence/follow-up";
import type { FollowUpQueueQuery } from "@/lib/absence/follow-up-schema";
import { followUpQueueHref } from "@/lib/absence/follow-up-url";

type Chip = {
  key: string;
  label: string;
  href: string;
  removeLabel: string;
};

function dropHref(
  query: FollowUpQueueQuery,
  overrides: Partial<FollowUpQueueQuery>,
) {
  return followUpQueueHref(query, { ...overrides, page: 1 });
}

export function FollowUpActiveFilters({
  query,
}: {
  query: FollowUpQueueQuery;
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
  if (query.type) {
    const label = `Type · ${ABSENCE_TYPE_LABELS[query.type]}`;
    chips.push({
      key: "type",
      label,
      href: dropHref(query, { type: "" }),
      removeLabel: `Remove ${label}`,
    });
  }
  if (query.due) {
    const label = `Due · ${FOLLOW_UP_DUE_LABELS[query.due]}`;
    chips.push({
      key: "due",
      label,
      href: dropHref(query, { due: "" }),
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
      <ButtonLink href="/follow-ups" variant="secondary" size="sm">
        Clear filters
      </ButtonLink>
    </div>
  );
}
