import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export function PlaceholderPage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <PageHeader title={title} description={description} />
      <EmptyState
        className="mt-8"
        title="Nothing here yet"
        description="This area is a placeholder for a future NoShowHQ module."
      />
    </div>
  );
}
