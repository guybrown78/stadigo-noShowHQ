import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/field";
import { SegmentedNav } from "@/components/ui/segmented-nav";
import { filterControlClassName } from "@/components/form";
import { ABSENCE_TYPES, FOLLOW_UP_DUE_GROUPS } from "@/lib/absence/catalog";
import { ABSENCE_TYPE_LABELS } from "@/lib/absence/display";
import { FOLLOW_UP_DUE_LABELS } from "@/lib/absence/follow-up";
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
  return (
    <div className="mt-6 space-y-3">
      <form
        key={`${query.q}|${query.type}|${query.due}`}
        method="get"
        className="space-y-3"
      >
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[12rem] flex-1">
            <FieldLabel htmlFor="follow-up-q" size="sm">
              Search
            </FieldLabel>
            <input
              id="follow-up-q"
              name="q"
              type="search"
              defaultValue={query.q}
              placeholder="Staff name or staff ID"
              className={filterControlClassName()}
            />
          </div>
          <Button type="submit" variant="secondary" size="sm">
            Apply
          </Button>
        </div>
        {query.type ? (
          <input type="hidden" name="type" value={query.type} />
        ) : null}
        {query.due ? (
          <input type="hidden" name="due" value={query.due} />
        ) : null}
        {query.detail ? (
          <input type="hidden" name="detail" value={query.detail} />
        ) : null}
      </form>
      <div>
        <p className="mb-1.5 text-xs font-medium text-muted">Absence type</p>
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
        <p className="mb-1.5 text-xs font-medium text-muted">Due</p>
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
  );
}
