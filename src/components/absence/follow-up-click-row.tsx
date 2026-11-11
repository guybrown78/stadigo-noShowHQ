"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";

function shouldIgnore(event: React.MouseEvent) {
  if (!(event.target instanceof Element)) {
    return true;
  }
  if (
    event.target.closest(
      "a, button, input, textarea, select, dialog, [data-follow-up-separate]",
    )
  ) {
    return true;
  }
  return (
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    event.button !== 0
  );
}

export function FollowUpClickRow({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <tr
      className={cn(
        "cursor-pointer border-b border-row hover:bg-wash",
        className,
      )}
      onClick={(event) => {
        if (shouldIgnore(event)) {
          return;
        }
        router.push(href);
      }}
    >
      {children}
    </tr>
  );
}

export function FollowUpClickCard({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <div
      className={cn("cursor-pointer", className)}
      onClick={(event) => {
        if (shouldIgnore(event)) {
          return;
        }
        router.push(href);
      }}
    >
      {children}
    </div>
  );
}
