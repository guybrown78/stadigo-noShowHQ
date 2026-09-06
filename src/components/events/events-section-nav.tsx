import { SegmentedNav } from "@/components/ui/segmented-nav";

export function EventsSectionNav({
  current,
}: {
  current: "events" | "venues";
}) {
  return (
    <SegmentedNav
      className="mt-3"
      label="Events sections"
      items={[
        { href: "/events", label: "Events", active: current === "events" },
        {
          href: "/settings/events",
          label: "Venues",
          active: current === "venues",
        },
      ]}
    />
  );
}
