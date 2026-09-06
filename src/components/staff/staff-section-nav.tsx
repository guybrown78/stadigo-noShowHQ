import { SegmentedNav } from "@/components/ui/segmented-nav";

export function StaffSectionNav({
  current,
  probationCount,
}: {
  current: "directory" | "probation";
  probationCount?: number;
}) {
  return (
    <SegmentedNav
      className="mt-3"
      label="Staff sections"
      items={[
        {
          href: "/staff",
          label: "Directory",
          active: current === "directory",
        },
        {
          href: "/staff/probation",
          label: "Probation",
          active: current === "probation",
          badge: probationCount,
        },
      ]}
    />
  );
}
