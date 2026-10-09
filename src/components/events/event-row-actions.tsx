"use client";

import { useState } from "react";
import { ArchiveEventDialog } from "@/components/events/archive-event-dialog";
import { DeleteEventDialog } from "@/components/events/delete-event-dialog";
import { RowActionsMenu } from "@/components/ui/row-actions-menu";

export function EventRowActions({
  eventId,
  eventName,
  archived,
}: {
  eventId: string;
  eventName: string;
  archived: boolean;
}) {
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <RowActionsMenu
        label={`Actions for ${eventName}`}
        items={[
          { href: `/events/${eventId}`, label: "View" },
          { href: `/events/${eventId}/edit`, label: "Edit" },
          {
            label: archived ? "Restore event" : "Archive event",
            onSelect: () => setArchiveOpen(true),
          },
          {
            label: "Delete event",
            tone: "danger",
            onSelect: () => setDeleteOpen(true),
          },
        ]}
      />
      <ArchiveEventDialog
        eventId={eventId}
        eventName={eventName}
        archived={archived}
        showTrigger={false}
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
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
