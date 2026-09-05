"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/cn";

export type RowActionItem =
  | { href: string; label: string; tone?: "default" | "danger" }
  | { label: string; tone?: "default" | "danger"; onSelect: () => void };

export function RowActionsMenu({
  label,
  items,
}: {
  label: string;
  items: RowActionItem[];
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, right: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  function placeMenu() {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    setCoords({
      top: rect.bottom + 4,
      right: window.innerWidth - rect.right,
    });
  }

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (
        rootRef.current &&
        !rootRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    function onReposition() {
      placeMenu();
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  const itemClass = (tone?: "default" | "danger") =>
    cn(
      "block w-full px-3 py-2 text-left text-sm",
      tone === "danger"
        ? "text-red-800 hover:bg-red-50"
        : "text-slate-700 hover:bg-slate-50",
    );

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        ref={buttonRef}
        type="button"
        className="inline-flex size-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => {
          placeMenu();
          setOpen((value) => !value);
        }}
      >
        <MoreHorizontal className="size-4" aria-hidden="true" />
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className="fixed z-50 min-w-[11rem] overflow-hidden rounded-lg border border-border bg-white py-1 shadow-lg"
          style={{ top: coords.top, right: coords.right }}
        >
          {items.map((item) =>
            "href" in item ? (
              <Link
                key={item.label}
                href={item.href}
                role="menuitem"
                className={itemClass(item.tone)}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={itemClass(item.tone)}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {item.label}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}
