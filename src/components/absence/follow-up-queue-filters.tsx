import { Button, ButtonLink } from "@/components/ui/button";
import { FilterBar, FilterField } from "@/components/ui/filter-bar";
import { SegmentedNav } from "@/components/ui/segmented-nav";
import { filterControlClassName } from "@/components/form";
import { ABSENCE_TYPES, FOLLOW_UP_DUE_GROUPS } from "@/lib/absence/catalog";
import { ABSENCE_TYPE_LABELS } from "@/lib/absence/display";
import { FOLLOW_UP_DUE_LABELS } from "@/lib/absence/follow-up";
import { followUpQueueHasFilters } from "@/lib/absence/follow-up-schema";
import type { FollowUpQueueQuery } from "@/lib/absence/follow-up-schema";
import { followUpQueueHref } from "@/lib/absence/follow-up-url";

function choiceHref(
  query: FollowUpQueueQuery,
  overrides: Partial<FollowUpQueueQuery>,
) {
  return followUpQueueHref(query, { ...overrides, page: 1 });
}

export function FollowUpQueueFilters({
  query,
}: {
  query: FollowUpQueueQuery;
}) {
  const hasFilters = followUpQueueHasFilters(query);

  return (
    <div className="mt-6 space-y-4">
      <div className="space-y-3">
        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-500">
            Absence type
          </p>
          <SegmentedNav
            label="Absence type"
            items={[
              {
                href: choiceHref(query, { type: "" }),
                label: "All types",
                active: query.type === "",
              },
              ...ABSENCE_TYPES.map((type) => ({
                href: choiceHref(query, { type }),
                label: ABSENCE_TYPE_LABELS[type],
                active: query.type === type,
              })),
            ]}
          />
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-500">Due</p>
          <SegmentedNav
            label="Due"
            items={[
              {
                href: choiceHref(query, { due: "" }),
                label: "All open",
                active: query.due === "",
              },
              ...FOLLOW_UP_DUE_GROUPS.map((due) => ({
                href: choiceHref(query, { due }),
                label: FOLLOW_UP_DUE_LABELS[due],
                active: query.due === due,
              })),
            ]}
          />
        </div>
      </div>

      <form method="get">
        {query.type ? (
          <input type="hidden" name="type" value={query.type} />
        ) : null}
        {query.due ? (
          <input type="hidden" name="due" value={query.due} />
        ) : null}
        {query.detail ? (
          <input type="hidden" name="detail" value={query.detail} />
        ) : null}
        <FilterBar ariaLabel="Follow-up filters" active={hasFilters}>
          <FilterField
            label="Search"
            htmlFor="follow-up-q"
            className="min-w-[12rem] flex-[1.4]"
          >
            <input
              id="follow-up-q"
              name="q"
              type="search"
              defaultValue={query.q}
              placeholder="Staff name or staff ID"
              className={filterControlClassName()}
            />
          </FilterField>
          <div className="flex items-end gap-2">
            <Button type="submit" size="sm">
              Apply
            </Button>
            {hasFilters ? (
              <ButtonLink href="/follow-ups" variant="secondary" size="sm">
                Clear filters
              </ButtonLink>
            ) : null}
          </div>
        </FilterBar>
      </form>
    </div>
  );
}
