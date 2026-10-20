"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { advanceImportAction } from "@/app/(app)/staff/import/actions";
import type { ImportCreateProgress } from "@/lib/staff/import/service";

function progressLabel(progress: ImportCreateProgress) {
  if (progress.phase === "link") {
    return `Adding managers, ${progress.completed} of ${progress.total}`;
  }
  return `Creating staff, ${progress.completed} of ${progress.total}`;
}

export function ConfirmStaffImportForm({
  importId,
  staffCount,
  progress,
}: {
  importId: string;
  staffCount: number;
  progress: ImportCreateProgress;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [current, setCurrent] = useState(progress);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    setCurrent((previous) => ({ ...previous, started: true }));
    try {
      let step = await advanceImportAction(importId);
      for (;;) {
        if (!step.ok) {
          setError(step.error);
          if (step.total > 0) {
            setCurrent({
              started: true,
              phase: step.phase,
              completed: step.completed,
              total: step.total,
            });
          }
          setRunning(false);
          return;
        }
        if (step.done) {
          router.push(step.href);
          return;
        }
        setCurrent({
          started: true,
          phase: step.phase,
          completed: step.completed,
          total: step.total,
        });
        step = await advanceImportAction(importId);
      }
    } catch {
      setError(
        "Staff could not be created. You can continue from the people already saved.",
      );
      setRunning(false);
    }
  }

  const label = progressLabel(current);
  const showProgress = running || current.started;

  return (
    <div className="space-y-3">
      {showProgress ? (
        <section
          className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
          role="status"
          aria-live="polite"
        >
          <h2 className="text-sm font-semibold text-slate-900">
            {error ? "Creation paused" : label}
          </h2>
          {error ? (
            <p className="mt-1 text-sm text-slate-700">{label}</p>
          ) : (
            <p className="mt-1 text-sm text-slate-600">
              {running
                ? "Please keep this page open until this finishes."
                : "People already saved are kept. Continue to finish the rest."}
            </p>
          )}
          {error ? (
            <p className="mt-2 text-sm text-red-800" role="alert">
              {error}
            </p>
          ) : null}
          {running ? null : (
            <button
              type="button"
              onClick={run}
              className="mt-3 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
            >
              Continue
            </button>
          )}
        </section>
      ) : (
        <button
          type="button"
          onClick={run}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
        >
          Create {staffCount} {staffCount === 1 ? "staff member" : "staff members"}
        </button>
      )}
      <p className="text-xs text-slate-500">
        This creates new operational staff records only. It does not update
        existing staff, create user accounts, or send communications.
      </p>
    </div>
  );
}
