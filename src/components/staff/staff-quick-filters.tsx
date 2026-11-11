import { FieldLabel } from "@/components/ui/field";
import { SegmentedNav } from "@/components/ui/segmented-nav";
import type { StaffListQuery } from "@/lib/staff/schema";
import { staffListHref } from "@/lib/staff/url";

function choiceHref(
  query: StaffListQuery,
  probationLifecycle: StaffListQuery["probationLifecycle"],
) {
  return staffListHref(query, { probationLifecycle, page: 1 });
}

export function StaffQuickFilters({ query }: { query: StaffListQuery }) {
  return (
    <div>
      <FieldLabel size="sm">Urgency</FieldLabel>
      <SegmentedNav
        label="Urgency"
        items={[
          {
            href: choiceHref(query, ""),
            label: "All",
            active: query.probationLifecycle === "",
          },
          {
            href: choiceHref(query, "review_due"),
            label: "Review due",
            active: query.probationLifecycle === "review_due",
          },
          {
            href: choiceHref(query, "overdue"),
            label: "Overdue",
            active: query.probationLifecycle === "overdue",
          },
        ]}
      />
    </div>
  );
}
