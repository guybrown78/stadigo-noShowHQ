"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateColorSchemeAction } from "@/app/profile/actions";
import type { ColorSchemeChoice } from "@/lib/color-scheme";
import { cn } from "@/lib/cn";

const OPTIONS: Array<{ value: ColorSchemeChoice; label: string }> = [
  { value: "LIGHT", label: "Light" },
  { value: "DARK", label: "Dark" },
];

export function AppearanceForm({
  colorScheme,
}: {
  colorScheme: ColorSchemeChoice;
}) {
  const router = useRouter();
  const [scheme, setScheme] = useState(colorScheme);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function choose(next: ColorSchemeChoice) {
    if (next === scheme || pending) return;
    const previous = scheme;
    setScheme(next);
    setError(null);
    startTransition(async () => {
      const result = await updateColorSchemeAction(next);
      if (result.error) {
        setScheme(previous);
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div>
      <div
        className="inline-flex rounded-lg bg-rail p-1"
        role="radiogroup"
        aria-label="Colour scheme"
      >
        {OPTIONS.map((option) => {
          const selected = scheme === option.value;
          return (
            <label
              key={option.value}
              className={cn(
                "cursor-pointer rounded-md px-4 py-2 text-sm has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary",
                selected
                  ? "bg-surface font-medium text-foreground shadow-sm"
                  : "text-muted hover:text-foreground",
              )}
            >
              <input
                type="radio"
                name="colorScheme"
                value={option.value}
                checked={selected}
                className="sr-only"
                onChange={() => choose(option.value)}
              />
              {option.label}
            </label>
          );
        })}
      </div>
      <p className="mt-3 text-sm text-muted" aria-live="polite">
        {pending ? "Saving…" : "Light is the default. Your choice is kept on this account."}
      </p>
      {error ? (
        <p className="mt-2 text-sm text-cancel" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
