"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";

function shouldIgnore(event: React.MouseEvent) {
  if (!(event.target instanceof Element)) {
    return true;
  }
  if (
    event.target.closest(
      "a, button, input, textarea, select, dialog, [data-event-separate]",
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

export function EventClickRow({
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
        "cursor-pointer border-b border-slate-100 hover:bg-slate-50",
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

export function EventClickCard({
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
