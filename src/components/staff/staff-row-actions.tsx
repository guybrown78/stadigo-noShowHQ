"use client";

import { useState } from "react";
import { DeleteStaffDialog } from "@/components/staff/delete-staff-dialog";
import { RowActionsMenu } from "@/components/ui/row-actions-menu";

export function StaffRowActions({
  staffId,
  staffName,
  staffIdNumber,
}: {
  staffId: string;
  staffName: string;
  staffIdNumber: string;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <RowActionsMenu
        label={`Actions for ${staffName}`}
        items={[
          { href: `/staff/${staffId}`, label: "View" },
          { href: `/staff/${staffId}/edit`, label: "Edit" },
          {
            label: "Delete staff member",
            tone: "danger",
            onSelect: () => setDeleteOpen(true),
          },
        ]}
      />
      <DeleteStaffDialog
        staffId={staffId}
        staffName={staffName}
        staffIdNumber={staffIdNumber}
        showTrigger={false}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </>
  );
}
