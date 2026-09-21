"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  sheetHasNestedDialog,
  sheetMotionMs,
  sheetTabWrapTarget,
} from "@/components/ui/sheet-keyboard";
import { lockPageScroll } from "@/components/ui/page-scroll-lock";
import { cn } from "@/lib/cn";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function Sheet({
  open,
  labelledBy,
  closeHref,
  returnFocusId,
  children,
}: {
  open: boolean;
  labelledBy: string;
  closeHref: string;
  returnFocusId?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef(children);
  const returnFocusRef = useRef(returnFocusId);
  const enteredRef = useRef(false);
  const closingRef = useRef(false);
  const closeStartedAtRef = useRef(0);
  const closeLabelId = useId();
  const [mounted, setMounted] = useState(false);
  const [entered, setEntered] = useState(false);
  const mountedRef = useRef(mounted);

  if (children) {
    contentRef.current = children;
  }
  if (returnFocusId) {
    returnFocusRef.current = returnFocusId;
  }
  enteredRef.current = entered;
  mountedRef.current = mounted;

  const finishUnmount = useCallback(() => {
    setMounted(false);
    setEntered(false);
    closingRef.current = false;
    closeStartedAtRef.current = 0;
    const id = returnFocusRef.current;
    if (!id) {
      return;
    }
    const nodes = [
      ...document.querySelectorAll<HTMLElement>(
        `[data-ledger-view="${CSS.escape(id)}"]`,
      ),
    ];
    const visible = nodes.find((node) => node.getClientRects().length > 0);
    (visible ?? nodes[0])?.focus();
  }, []);

  const navigateClosed = useCallback(() => {
    router.replace(closeHref, { scroll: false });
  }, [router, closeHref]);

  const close = useCallback(() => {
    if (closingRef.current || !mountedRef.current) {
      return;
    }
    closingRef.current = true;
    closeStartedAtRef.current = performance.now();
    setEntered(false);
    navigateClosed();
  }, [navigateClosed]);

  useEffect(() => {
    if (open) {
      closingRef.current = false;
      closeStartedAtRef.current = 0;
      setMounted(true);
      return;
    }

    setEntered(false);
    if (!mountedRef.current) {
      return;
    }
    const elapsed = closeStartedAtRef.current
      ? performance.now() - closeStartedAtRef.current
      : 0;
    const remaining = Math.max(
      0,
      sheetMotionMs(prefersReducedMotion()) - elapsed,
    );
    const timer = window.setTimeout(finishUnmount, remaining);
    return () => window.clearTimeout(timer);
  }, [finishUnmount, open]);

  useEffect(() => {
    if (!open || !mounted) {
      return;
    }
    panelRef.current?.getBoundingClientRect();
    setEntered(true);
  }, [mounted, open]);

  useLayoutEffect(() => {
    if (!mounted) {
      return;
    }
    return lockPageScroll();
  }, [mounted]);

  useEffect(() => {
    if (!mounted) {
      return;
    }
    const panel = panelRef.current;

    function onKeyDown(event: KeyboardEvent) {
      if (sheetHasNestedDialog(document)) {
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab" || !panel) {
        return;
      }
      const nodes = [
        ...panel.querySelectorAll<HTMLElement>(FOCUSABLE),
      ].filter(
        (node) =>
          !node.hasAttribute("disabled") &&
          node.tabIndex !== -1 &&
          node.getClientRects().length > 0,
      );
      if (nodes.length === 0) {
        event.preventDefault();
        return;
      }
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      const wrap = sheetTabWrapTarget(
        event.shiftKey,
        active === first,
        active === last,
      );
      if (wrap === "last") {
        event.preventDefault();
        last.focus();
      } else if (wrap === "first") {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [close, mounted]);

  useEffect(() => {
    if (!entered) {
      return;
    }
    panelRef.current
      ?.querySelector<HTMLElement>("[data-sheet-close]")
      ?.focus();
  }, [entered]);

  if (!mounted) {
    return null;
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-[60] overflow-hidden",
        entered ? null : "pointer-events-none",
      )}
      data-sheet-root=""
      data-state={entered ? "open" : "closed"}
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40"
        data-sheet-backdrop=""
        aria-label="Close details"
        style={{ opacity: entered ? 1 : 0 }}
        onClick={close}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        data-sheet-panel=""
        className="absolute inset-0 flex h-dvh w-full flex-col overflow-hidden bg-white shadow-2xl sm:inset-y-0 sm:right-0 sm:left-auto sm:w-[32rem] sm:max-w-[100vw] sm:rounded-l-2xl sm:border-l sm:border-border"
        style={{ translate: entered ? "0 0" : "100% 0" }}
      >
        <div className="flex shrink-0 justify-end border-b border-border px-4 py-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            data-sheet-close=""
            aria-labelledby={closeLabelId}
            onClick={close}
          >
            <X className="size-4" aria-hidden="true" />
            <span id={closeLabelId}>Close</span>
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 py-4 sm:px-5">
          {contentRef.current}
        </div>
      </div>
    </div>
  );
}
