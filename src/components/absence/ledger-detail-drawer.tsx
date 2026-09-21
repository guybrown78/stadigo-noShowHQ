"use client";

import { Sheet } from "@/components/ui/sheet";

export function LedgerDetailDrawer({
  open,
  titleId,
  closeHref,
  returnFocusId,
  children,
}: {
  open: boolean;
  titleId: string;
  closeHref: string;
  returnFocusId: string;
  children: React.ReactNode;
}) {
  return (
    <Sheet
      open={open}
      labelledBy={titleId}
      closeHref={closeHref}
      returnFocusId={returnFocusId}
    >
      {children}
    </Sheet>
  );
}
