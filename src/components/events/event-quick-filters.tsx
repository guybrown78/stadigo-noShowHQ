import { FieldLabel } from "@/components/ui/field";
import { SegmentedNav } from "@/components/ui/segmented-nav";
import type { EventListQuery } from "@/lib/events/schema";
import { eventsListHref } from "@/lib/events/url";

function choiceHref(query: EventListQuery, range: EventListQuery["range"]) {
  return eventsListHref(query, { range, page: 1, from: "", to: "" });
}

export function EventQuickFilters({ query }: { query: EventListQuery }) {
  return (
    <div>
      <FieldLabel size="sm">When</FieldLabel>
      <SegmentedNav
        label="When"
        items={[
          {
            href: choiceHref(query, "upcoming"),
            label: "Upcoming",
            active: query.range === "upcoming",
          },
          {
            href: choiceHref(query, "all"),
            label: "All",
            active: query.range === "all",
          },
          {
            href: choiceHref(query, "past"),
            label: "Past",
            active: query.range === "past",
          },
          {
            href: choiceHref(query, "archived"),
            label: "Archived",
            active: query.range === "archived",
          },
        ]}
      />
    </div>
  );
}
