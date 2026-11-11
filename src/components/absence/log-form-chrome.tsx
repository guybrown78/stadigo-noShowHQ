"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";

export function LogFormCard({ children }: { children: React.ReactNode }) {
  return (
    <Card className="shadow-none">
      <CardBody className="space-y-4">{children}</CardBody>
    </Card>
  );
}

export function LogFormBar({
  summary,
  payPeriod,
  onClear,
  pending,
  saveDisabled,
  saveLabel,
}: {
  summary: React.ReactNode;
  payPeriod: React.ReactNode;
  onClear: () => void;
  pending: boolean;
  saveDisabled?: boolean;
  saveLabel: string;
}) {
  return (
    <div className="sticky bottom-0 z-10 -mx-1 space-y-3 rounded-xl border border-border bg-surface/95 px-4 py-3 shadow-[0_-10px_24px_rgba(23,33,28,0.06)] backdrop-blur-sm">
      <p className="min-w-0 text-sm text-muted">{summary}</p>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64">{payPeriod}</div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" onClick={onClear}>
            Clear
          </Button>
          <Button type="submit" disabled={pending || saveDisabled} icon={Check}>
            {pending ? "Saving…" : saveLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function OptionalDetails({
  summary,
  forceOpen = false,
  children,
}: {
  summary: string;
  forceOpen?: boolean;
  children: React.ReactNode;
}) {
  const [opened, setOpened] = useState(false);
  return (
    <details
      open={opened || forceOpen}
      onToggle={(event) => setOpened(event.currentTarget.open)}
      className="rounded-md border border-border px-3 py-2"
    >
      <summary className="cursor-pointer text-sm font-medium text-foreground">
        {summary}
      </summary>
      <div className="mt-3 space-y-3">{children}</div>
    </details>
  );
}
