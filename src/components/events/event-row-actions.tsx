"use client";

import { useState } from "react";
import { DeleteEventDialog } from "@/components/events/delete-event-dialog";
import { RowActionsMenu } from "@/components/ui/row-actions-menu";

export function EventRowActions({
  eventId,
  eventName,
}: {
  eventId: string;
  eventName: string;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <RowActionsMenu
        label={`Actions for ${eventName}`}
        items={[
          { href: `/events/${eventId}`, label: "View" },
          { href: `/events/${eventId}/edit`, label: "Edit" },
          {
            label: "Delete event",
            tone: "danger",
            onSelect: () => setDeleteOpen(true),
          },
        ]}
      />
      <DeleteEventDialog
        eventId={eventId}
        eventName={eventName}
        showTrigger={false}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </>
  );
}
