import { ButtonLink } from "@/components/ui/button";
import { FilterBar, FilterField } from "@/components/ui/filter-bar";
import { filterControlClassName } from "@/components/form";
import { followUpQueueHasFilters } from "@/lib/absence/follow-up-schema";
import type { FollowUpQueueQuery } from "@/lib/absence/follow-up-schema";

export function FollowUpQueueFilters({
  query,
}: {
  query: FollowUpQueueQuery;
}) {
  const hasFilters = followUpQueueHasFilters(query);

  return (
    <form method="get" className="mt-6">
      {query.detail ? (
        <input type="hidden" name="detail" value={query.detail} />
      ) : null}
      <FilterBar ariaLabel="Follow-up filters" active={hasFilters}>
        <FilterField label="Search" htmlFor="follow-up-q">
          <input
            id="follow-up-q"
            name="q"
            defaultValue={query.q}
            placeholder="Staff name or staff ID"
            className={filterControlClassName()}
          />
        </FilterField>
        <FilterField label="Absence type" htmlFor="follow-up-type">
          <select
            id="follow-up-type"
            name="type"
            defaultValue={query.type}
            className={filterControlClassName()}
          >
            <option value="">All types</option>
            <option value="CANCELLATION">Cancellation</option>
            <option value="AWOL">AWOL</option>
            <option value="SICKNESS">Sickness</option>
          </select>
        </FilterField>
        <FilterField label="Due" htmlFor="follow-up-due">
          <select
            id="follow-up-due"
            name="due"
            defaultValue={query.due}
            className={filterControlClassName()}
          >
            <option value="">All open</option>
            <option value="overdue">Overdue</option>
            <option value="dueToday">Due today</option>
            <option value="upcoming">Upcoming</option>
          </select>
        </FilterField>
        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-hover"
          >
            Apply
          </button>
          {hasFilters ? (
            <ButtonLink href="/follow-ups" variant="secondary" size="sm">
              Clear filters
            </ButtonLink>
          ) : null}
        </div>
      </FilterBar>
    </form>
  );
}
