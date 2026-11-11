import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import {
  CLEARANCE_STATUS_LABELS,
  EMPLOYMENT_STATUS_LABELS,
  PROBATION_STATUS_LABELS,
} from "@/lib/staff/display";
import type { StaffListQuery } from "@/lib/staff/schema";
import { staffListHref } from "@/lib/staff/url";

type Chip = {
  key: string;
  label: string;
  href: string;
  removeLabel: string;
};

function dropHref(query: StaffListQuery, overrides: Partial<StaffListQuery>) {
  return staffListHref(query, { ...overrides, page: 1 });
}

const URGENCY_LABELS = {
  review_due: "Review due",
  overdue: "Overdue",
} as const;

export function StaffActiveFilters({ query }: { query: StaffListQuery }) {
  const chips: Chip[] = [];
  if (query.q) {
    chips.push({
      key: "q",
      label: `Search · ${query.q}`,
      href: dropHref(query, { q: "" }),
      removeLabel: `Remove search ${query.q}`,
    });
  }
  if (query.employmentStatus) {
    const label = `Employment · ${EMPLOYMENT_STATUS_LABELS[query.employmentStatus]}`;
    chips.push({
      key: "employment",
      label,
      href: dropHref(query, { employmentStatus: "" }),
      removeLabel: `Remove ${label}`,
    });
  }
  if (query.department) {
    const label = `Department · ${query.department}`;
    chips.push({
      key: "department",
      label,
      href: dropHref(query, { department: "" }),
      removeLabel: `Remove ${label}`,
    });
  }
  if (query.probationStatus) {
    const label = `Probation · ${PROBATION_STATUS_LABELS[query.probationStatus]}`;
    chips.push({
      key: "probation",
      label,
      href: dropHref(query, { probationStatus: "" }),
      removeLabel: `Remove ${label}`,
    });
  }
  if (query.probationLifecycle) {
    const label = `Urgency · ${URGENCY_LABELS[query.probationLifecycle]}`;
    chips.push({
      key: "urgency",
      label,
      href: dropHref(query, { probationLifecycle: "" }),
      removeLabel: `Remove ${label}`,
    });
  }
  if (query.clearanceStatus) {
    const label = `Clearance · ${CLEARANCE_STATUS_LABELS[query.clearanceStatus]}`;
    chips.push({
      key: "clearance",
      label,
      href: dropHref(query, { clearanceStatus: "" }),
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
      <ButtonLink href="/staff" variant="secondary" size="sm">
        Clear filters
      </ButtonLink>
    </div>
  );
}
