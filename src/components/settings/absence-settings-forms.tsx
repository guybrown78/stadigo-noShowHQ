"use client";

import { useActionState, useLayoutEffect, useRef, useState, useTransition } from "react";
import type { AbsenceReason, AbsenceReasonKind } from "@prisma/client";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  addAbsenceReasonAction,
  deleteAbsenceReasonAction,
  moveAbsenceReasonAction,
  updateAbsenceReasonAction,
  updateAttendanceSettingsAction,
  type SettingsActionState,
} from "@/app/(app)/settings/absence-actions";
import { FormAlert, controlClassName } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";

const initialState: SettingsActionState = {};

export function AbsenceSettingsForms({
  tenant,
  reasons,
}: {
  tenant: {
    shortNoticeHours: number;
    cancellationThreshold: number;
    awolThresholdCount: number;
    awolWindowDays: number;
  };
  reasons: AbsenceReason[];
}) {
  const [settingsState, settingsAction, settingsPending] = useActionState(
    updateAttendanceSettingsAction,
    initialState,
  );
  return (
    <div className="mt-8 space-y-8">
      <Card>
        <CardHeader
          headingId="attendance-thresholds-heading"
          title="Thresholds"
          description="Defaults are 3 cancellations, 24 hours’ short notice, and 3 AWOLs in 30 days. Each organisation can change these."
        />
        <CardBody>
          <form action={settingsAction} className="grid max-w-xl gap-4">
            <FormAlert>{settingsState.error}</FormAlert>
            {settingsState.ok ? (
              <p className="text-sm text-emerald-800">Thresholds saved.</p>
            ) : null}
            <NumberField
              name="shortNoticeHours"
              label="Short notice, in hours"
              defaultValue={tenant.shortNoticeHours}
            />
            <NumberField
              name="cancellationThreshold"
              label="Cancellations in a pay period before the dashboard flags them"
              defaultValue={tenant.cancellationThreshold}
            />
            <NumberField
              name="awolThresholdCount"
              label="AWOLs inside the window before the dashboard flags them"
              defaultValue={tenant.awolThresholdCount}
            />
            <NumberField
              name="awolWindowDays"
              label="AWOL window, in days"
              defaultValue={tenant.awolWindowDays}
            />
            <Button type="submit" disabled={settingsPending}>
              Save thresholds
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          headingId="absence-reasons-heading"
          title="Reasons"
          description="Cancellation and sickness are separate lists. Saved absences keep the reason already written on them."
        />
        <CardBody className="space-y-8">
          <ReasonList kind="CANCELLATION" title="Cancellation" reasons={reasons} />
          <ReasonList kind="SICKNESS" title="Sickness" reasons={reasons} />
        </CardBody>
      </Card>
    </div>
  );
}

function DeleteReasonButton({ id }: { id: string }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <Button
        type="button"
        variant="danger"
        size="sm"
        className="w-full"
        onClick={() => setConfirming(true)}
      >
        Delete
      </Button>
    );
  }
  return (
    <form action={deleteAbsenceReasonAction}>
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit"
        variant="danger"
        size="sm"
        className="w-full"
        autoFocus
        onBlur={() => setConfirming(false)}
      >
        Confirm
      </Button>
    </form>
  );
}

function NumberField({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue: number;
}) {
  return (
    <label className="text-sm font-medium text-slate-700">
      {label}
      <input
        name={name}
        type="number"
        defaultValue={defaultValue}
        className={controlClassName("mt-1 block w-full")}
      />
    </label>
  );
}

function ReasonRow({
  reason,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  rowRef,
}: {
  reason: AbsenceReason;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  rowRef: (node: HTMLLIElement | null) => void;
}) {
  const [label, setLabel] = useState(reason.label);
  const [active, setActive] = useState(reason.active);
  const [state, action, pending] = useActionState(
    updateAbsenceReasonAction,
    initialState,
  );
  const savedLabel = reason.label;
  const savedActive = reason.active;
  const dirty =
    label.trim().replace(/\s+/g, " ") !== savedLabel || active !== savedActive;

  return (
    <li
      ref={rowRef}
      className={
        dirty
          ? "grid grid-cols-[minmax(12rem,20rem)_7.5rem_5.5rem_2.25rem_2.25rem_5.5rem] items-center gap-2 rounded-md border border-emerald-600 bg-emerald-50 px-2 py-1.5"
          : "grid grid-cols-[minmax(12rem,20rem)_7.5rem_5.5rem_2.25rem_2.25rem_5.5rem] items-center gap-2 rounded-md border border-transparent px-2 py-1.5"
      }
    >
      <form action={action} className="contents">
        <input type="hidden" name="id" value={reason.id} />
        <input
          name="label"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          aria-label={savedLabel}
          className={controlClassName("w-full")}
        />
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="active"
            checked={active}
            onChange={(event) => setActive(event.target.checked)}
          />
          Active
        </label>
        {dirty ? (
          <Button type="submit" size="sm" disabled={pending} className="w-full">
            Save
          </Button>
        ) : (
          <span />
        )}
      </form>
      <IconButton label="Move up" disabled={!canMoveUp} onClick={onMoveUp}>
        <ChevronUp className="size-4" aria-hidden="true" />
      </IconButton>
      <IconButton label="Move down" disabled={!canMoveDown} onClick={onMoveDown}>
        <ChevronDown className="size-4" aria-hidden="true" />
      </IconButton>
      <DeleteReasonButton id={reason.id} />
      {state.error ? (
        <p className="col-span-full text-sm text-red-700" role="alert">
          {state.error}
        </p>
      ) : null}
    </li>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex size-9 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function AddReasonForm({
  kind,
  title,
}: {
  kind: AbsenceReasonKind;
  title: string;
}) {
  const [state, action, pending] = useActionState(
    addAbsenceReasonAction,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);
  const listName = title.toLowerCase();

  useLayoutEffect(() => {
    if (wasPending.current && !pending && state.ok) {
      formRef.current?.reset();
    }
    wasPending.current = pending;
  }, [pending, state.ok]);

  return (
    <form
      ref={formRef}
      action={action}
      className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-3"
    >
      <p className="w-full text-sm font-medium text-slate-900">
        Add a {listName} reason
      </p>
      <input type="hidden" name="kind" value={kind} />
      <input
        name="label"
        aria-label={`New ${listName} reason`}
        placeholder={`New ${listName} reason`}
        className={controlClassName("min-w-64 flex-1")}
      />
      <Button type="submit" disabled={pending}>
        Add to {listName}
      </Button>
      {state.error ? (
        <p className="w-full text-sm text-red-700" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

function ReasonList({
  kind,
  title,
  reasons,
}: {
  kind: AbsenceReasonKind;
  title: string;
  reasons: AbsenceReason[];
}) {
  const incoming = reasons.filter((reason) => reason.kind === kind);
  const incomingKey = incoming
    .map((reason) => `${reason.id}:${reason.sortOrder}:${reason.label}:${reason.active}`)
    .join("|");
  const [rows, setRows] = useState(incoming);
  const [, startMove] = useTransition();
  const positions = useRef(new Map<string, number>());
  const rowNodes = useRef(new Map<string, HTMLLIElement>());

  useLayoutEffect(() => {
    const nextPositions = new Map<string, number>();
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const row of rows) {
      const element = rowNodes.current.get(row.id);
      if (!element) continue;
      const top = element.getBoundingClientRect().top;
      const previous = positions.current.get(row.id);
      if (!reduceMotion && previous != null && Math.abs(previous - top) > 1) {
        element.animate(
          [
            { transform: `translateY(${previous - top}px)` },
            { transform: "translateY(0)" },
          ],
          { duration: 220, easing: "cubic-bezier(0.2, 0, 0, 1)" },
        );
      }
      nextPositions.set(row.id, top);
    }
    positions.current = nextPositions;
  }, [rows]);

  useLayoutEffect(() => {
    setRows(incoming);
    // incomingKey captures label, order, and active changes from the server.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingKey]);

  function move(id: string, direction: -1 | 1) {
    setRows((current) => {
      const index = current.findIndex((reason) => reason.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) {
        return current;
      }
      const next = current.slice();
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item!);
      return next;
    });
    const formData = new FormData();
    formData.set("id", id);
    formData.set("direction", direction < 0 ? "up" : "down");
    startMove(() => {
      void moveAbsenceReasonAction(formData);
    });
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <AddReasonForm kind={kind} title={title} />
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600">No reasons yet.</p>
      ) : (
        <ul className="mt-2 space-y-1 overflow-x-auto">
          {rows.map((reason, index) => (
            <ReasonRow
              key={reason.id}
              reason={reason}
              canMoveUp={index > 0}
              canMoveDown={index < rows.length - 1}
              onMoveUp={() => move(reason.id, -1)}
              onMoveDown={() => move(reason.id, 1)}
              rowRef={(node) => {
                if (node) rowNodes.current.set(reason.id, node);
                else rowNodes.current.delete(reason.id);
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
