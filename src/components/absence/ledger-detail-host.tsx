"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { SquareArrowOutUpRight } from "lucide-react";
import { AbsenceDetailContent } from "@/components/absence/absence-detail-content";
import type { AbsenceDetailFlash } from "@/components/absence/absence-detail-content";
import { AbsenceTypeBadge } from "@/components/absence/absence-badges";
import { loadLedgerAbsenceDetail } from "@/app/(app)/ledger/detail-action";
import type { LedgerAbsenceDetailResult } from "@/app/(app)/ledger/detail-action";
import { ButtonLink, buttonClassName } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { LEDGER_FULL_PAGE_LABEL } from "@/lib/absence/display";
import type { LedgerDrawerPreview } from "@/lib/absence/ledger-drawer-preview";

const TITLE_ID = "ledger-absence-detail-title";

type LedgerDetailContextValue = {
  detailId: string;
  listHref: string;
  openDetail: (absenceId: string) => void;
};

const LedgerDetailContext = createContext<LedgerDetailContextValue | null>(
  null,
);

function withParam(href: string, key: string, value: string): string {
  const url = new URL(href, "http://noshowhq.local");
  url.searchParams.set(key, value);
  const qs = url.searchParams.toString();
  return qs ? `${url.pathname}?${qs}` : url.pathname;
}

function detailHref(listHref: string, absenceId: string): string {
  return withParam(listHref, "detail", absenceId);
}

export function ViewAbsenceButton({
  absenceId,
  label,
}: {
  absenceId: string;
  label: string;
}) {
  const context = useContext(LedgerDetailContext);
  if (!context) {
    throw new Error("ViewAbsenceButton must be used inside LedgerDetailHost");
  }
  const href = detailHref(context.listHref, absenceId);
  return (
    <a
      href={href}
      className={buttonClassName({ variant: "secondary", size: "sm" })}
      aria-label={label}
      aria-haspopup="dialog"
      aria-expanded={context.detailId === absenceId}
      data-ledger-view={absenceId}
      onClick={(event) => {
        if (
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          event.button !== 0
        ) {
          return;
        }
        event.preventDefault();
        context.openDetail(absenceId);
      }}
    >
      View
    </a>
  );
}

function Pulse({ className }: { className: string }) {
  return (
    <div className={`animate-pulse rounded bg-slate-200 ${className}`} />
  );
}

function FieldSkeleton({ label }: { label: string }) {
  return (
    <div role="group" aria-busy="true" aria-label={`Loading ${label}`}>
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <Pulse className="mt-2 h-4 w-48" />
    </div>
  );
}

function SectionSkeleton({ title }: { title: string }) {
  return (
    <div
      className="mt-6 rounded-xl border border-border bg-surface px-4 py-4"
      role="group"
      aria-busy="true"
      aria-label={`Loading ${title}`}
    >
      <p className="text-sm font-medium text-slate-900">{title}</p>
      <Pulse className="mt-3 h-4 w-full" />
      <Pulse className="mt-2 h-4 w-2/3" />
    </div>
  );
}

function ActionSkeleton() {
  return (
    <div
      className="mt-3 flex gap-2"
      role="group"
      aria-busy="true"
      aria-label="Loading actions"
    >
      <Pulse className="h-8 w-28" />
      <Pulse className="h-8 w-28" />
    </div>
  );
}

function StaffDetailSkeleton() {
  return (
    <div
      className="mt-2"
      role="group"
      aria-busy="true"
      aria-label="Loading staff role"
    >
      <Pulse className="h-4 w-36" />
    </div>
  );
}

function PreviewBody({
  preview,
  showActions,
  pending,
}: {
  preview: LedgerDrawerPreview;
  showActions: boolean;
  pending: boolean;
}) {
  return (
    <div>
      <header className="border-b border-border pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <AbsenceTypeBadge type={preview.type} />
          <span className="text-sm text-slate-700">{preview.statusLabel}</span>
        </div>
        <h2 id={TITLE_ID} className="mt-2 text-lg font-semibold text-slate-900">
          {preview.heading}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {preview.staffHref ? (
            <a href={preview.staffHref} className="underline">
              {preview.staffName}
            </a>
          ) : (
            preview.staffName
          )}
          {` · ${preview.staffIdNumber}`}
        </p>
        <StaffDetailSkeleton />
        {showActions ? <ActionSkeleton /> : null}
      </header>
      <dl className="mt-4 grid gap-6 sm:grid-cols-2">
        {preview.fields.map((field) => (
          <div key={field.label} className="min-w-0">
            <dt className="text-sm font-medium text-slate-500">{field.label}</dt>
            <dd className="mt-1 min-w-0 text-slate-900">
              {field.lines.map((line, index) => {
                if (index === 0 && field.href) {
                  return (
                    <a key={index} href={field.href} className="underline">
                      {line}
                    </a>
                  );
                }
                if (index === 0) {
                  return <span key={index}>{line}</span>;
                }
                return (
                  <p key={index} className="mt-1 text-sm text-slate-600">
                    {line}
                  </p>
                );
              })}
              {field.hints?.map((hint) => (
                <p key={hint} className="mt-1 text-sm text-slate-600">
                  {hint}
                </p>
              ))}
            </dd>
          </div>
        ))}
        {pending
          ? preview.pendingLabels.map((label) => (
              <FieldSkeleton key={label} label={label} />
            ))
          : null}
      </dl>
      {pending
        ? preview.sectionSkeletons.map((title) => (
            <SectionSkeleton key={title} title={title} />
          ))
        : null}
    </div>
  );
}

function UnknownBody() {
  return (
    <div>
      <h2 id={TITLE_ID} className="sr-only">
        Absence details
      </h2>
      <div role="group" aria-busy="true" aria-label="Loading absence">
        <Pulse className="h-6 w-28" />
        <Pulse className="mt-3 h-5 w-48" />
        <StaffDetailSkeleton />
        <ActionSkeleton />
      </div>
      <div className="mt-6 grid gap-6">
        <FieldSkeleton label="Details" />
      </div>
      {["Evidence", "Return to work", "Follow-ups", "History"].map((title) => (
        <SectionSkeleton key={title} title={title} />
      ))}
    </div>
  );
}

export function LedgerDetailHost({
  previews,
  listHref,
  initialDetailId,
  flash = {},
  children,
}: {
  previews: LedgerDrawerPreview[];
  listHref: string;
  initialDetailId: string;
  flash?: AbsenceDetailFlash;
  children: React.ReactNode;
}) {
  const [detailId, setDetailId] = useState(initialDetailId);
  const [displayId, setDisplayId] = useState(initialDetailId);
  const [loaded, setLoaded] = useState<LedgerAbsenceDetailResult | null>(null);
  const [error, setError] = useState(false);
  const shownId = detailId || displayId;
  const preview = previews.find((item) => item.id === shownId) ?? null;
  const loadedForShown =
    loaded && loaded.ok && loaded.absence.id === shownId ? loaded : null;

  const closeDetail = useCallback(() => {
    setDetailId("");
    window.history.replaceState(null, "", listHref);
  }, [listHref]);

  const openDetail = useCallback(
    (absenceId: string) => {
      setDetailId(absenceId);
      setDisplayId(absenceId);
      setError(false);
      window.history.pushState(null, "", detailHref(listHref, absenceId));
    },
    [listHref],
  );

  useEffect(() => {
    function onPopState() {
      const next = new URLSearchParams(window.location.search).get("detail") ?? "";
      setDetailId(next);
      setError(false);
      if (next) {
        setDisplayId(next);
      }
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const input = document.querySelector<HTMLInputElement>(
      "input[data-ledger-detail]",
    );
    if (!input) {
      return;
    }
    input.value = detailId;
    input.disabled = detailId.length === 0;
  }, [detailId]);

  useEffect(() => {
    if (!detailId) {
      return;
    }
    let cancelled = false;
    loadLedgerAbsenceDetail(detailId)
      .then((result) => {
        if (cancelled) {
          return;
        }
        if (!result.ok) {
          closeDetail();
          return;
        }
        setLoaded(result);
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [closeDetail, detailId]);

  const fullPageLabel = preview?.fullPageLabel ?? LEDGER_FULL_PAGE_LABEL;
  const headerAction = shownId ? (
    <ButtonLink
      href={`/absence/${shownId}`}
      variant="secondary"
      size="sm"
      className="px-2"
      aria-label={fullPageLabel}
      title={fullPageLabel}
    >
      <SquareArrowOutUpRight className="size-4" aria-hidden="true" />
    </ButtonLink>
  ) : null;

  let body: React.ReactNode = null;
  if (shownId) {
    if (loadedForShown) {
      body = (
        <AbsenceDetailContent
          absence={loadedForShown.absence}
          flash={shownId === initialDetailId ? flash : {}}
          layout="drawer"
          titleId={TITLE_ID}
          archiveReturnTo={withParam(
            detailHref(listHref, shownId),
            "archived",
            "1",
          )}
          episodeUpdateReturnTo={withParam(
            detailHref(listHref, shownId),
            "episodeUpdated",
            "1",
          )}
          followUpReturnTo={withParam(
            detailHref(listHref, shownId),
            "followUp",
            "1",
          )}
          evidenceReturnTo={withParam(
            detailHref(listHref, shownId),
            "evidence",
            "1",
          )}
          returnToWorkReturnTo={withParam(
            detailHref(listHref, shownId),
            "returnToWork",
            "1",
          )}
          timeZone={loadedForShown.timeZone}
          todayIso={loadedForShown.todayIso}
        />
      );
    } else if (preview) {
      body = (
        <>
          <PreviewBody
            preview={preview}
            pending={!error}
            showActions={preview.recordStatus === "ACTIVE" && !error}
          />
          {error ? (
            <p className="mt-4 text-sm text-red-800" role="alert">
              This absence could not be loaded.
            </p>
          ) : null}
        </>
      );
    } else {
      body = error ? (
        <p className="text-sm text-red-800" role="alert">
          This absence could not be loaded.
        </p>
      ) : (
        <UnknownBody />
      );
    }
  }

  return (
    <LedgerDetailContext.Provider
      value={{ detailId, listHref, openDetail }}
    >
      <div inert={detailId ? true : undefined}>{children}</div>
      <Sheet
        open={Boolean(detailId)}
        labelledBy={TITLE_ID}
        closeHref={listHref}
        returnFocusId={shownId}
        onClose={closeDetail}
        headerAction={headerAction}
      >
        {body}
      </Sheet>
    </LedgerDetailContext.Provider>
  );
}
