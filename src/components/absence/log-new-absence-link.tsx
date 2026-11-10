"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/button";
import {
  rememberRecordFields,
  recordHasUnsavedChanges,
} from "@/lib/absence/unsaved-record";

export function AbsenceRecord({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    rememberRecordFields(root);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof Element) rememberRecordFields(node);
        });
      }
    });
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} data-absence-record className="contents">
      {children}
    </div>
  );
}

export function LogNewAbsenceLink({ size }: { size: "sm" | "md" }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLButtonElement>("button")?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <>
      <ButtonLink
        href="/absence/new"
        size={size}
        icon={Plus}
        onClick={(event) => {
          if (
            event.defaultPrevented ||
            event.button !== 0 ||
            event.metaKey ||
            event.altKey ||
            event.ctrlKey ||
            event.shiftKey
          ) {
            return;
          }
          const root = event.currentTarget.closest("[data-absence-record]");
          if (!root || !recordHasUnsavedChanges(root)) return;
          event.preventDefault();
          setOpen(true);
        }}
      >
        Log new absence
      </ButtonLink>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-[min(100%,28rem)] rounded-lg border border-slate-200 p-0 shadow-xl backdrop:bg-slate-900/40"
        onClose={() => setOpen(false)}
      >
        <div className="p-5">
          <h2 id={titleId} className="text-lg font-semibold text-slate-900">
            Leave this record?
          </h2>
          <p id={descriptionId} className="mt-2 text-sm text-slate-600">
            You have unsaved changes on this record. Stay to keep them. Leaving
            does not save them.
          </p>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Stay
            </Button>
            <Button
              type="button"
              size="sm"
              className="border-red-700 bg-red-700 text-white hover:bg-red-800"
              onClick={() => {
                setOpen(false);
                router.push("/absence/new");
              }}
            >
              Leave without saving
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
