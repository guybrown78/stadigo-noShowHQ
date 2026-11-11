"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

export const DASHBOARD_LIST_PREVIEW = 5;

export function useListPreview(total: number) {
  const [expanded, setExpanded] = useState(false);
  const canToggle = total > DASHBOARD_LIST_PREVIEW;
  const visibleCount =
    expanded || !canToggle ? total : DASHBOARD_LIST_PREVIEW;
  return { expanded, canToggle, visibleCount, setExpanded };
}

export function ShowAllButton({
  total,
  expanded,
  onToggle,
  className,
}: {
  total: number;
  expanded: boolean;
  onToggle: () => void;
  className?: string;
}) {
  if (total <= DASHBOARD_LIST_PREVIEW) return null;
  return (
    <button
      type="button"
      className={cn(
        "text-sm font-medium text-primary-hover hover:underline",
        className,
      )}
      aria-expanded={expanded}
      onClick={onToggle}
    >
      {expanded ? "Show less" : `Show all ${total}`}
    </button>
  );
}
