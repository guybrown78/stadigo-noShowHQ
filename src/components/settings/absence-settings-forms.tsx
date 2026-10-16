"use client";

import { useActionState } from "react";
import type { AbsenceReason, AbsenceReasonKind } from "@prisma/client";
import {
  addAbsenceReasonAction,
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
    payPeriodStartDay: number;
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
  const [addState, addAction, addPending] = useActionState(
    addAbsenceReasonAction,
    initialState,
  );

  return (
    <div className="mt-8 space-y-8">
      <Card>
        <CardHeader
          headingId="attendance-thresholds-heading"
          title="Thresholds"
          description="Defaults are a calendar month, 3 cancellations, 24 hours’ short notice, and 3 AWOLs in 30 days. Each organisation can change these."
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
              name="payPeriodStartDay"
              label="Pay period starts on this day of the month (1–28)"
              defaultValue={tenant.payPeriodStartDay}
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
          description="Cancellation reasons and sickness issues are separate. Other stays available on the forms. The lists start empty."
        />
        <CardBody className="space-y-6">
          <form action={addAction} className="flex flex-wrap items-end gap-3">
            <FormAlert>{addState.error}</FormAlert>
            <label className="text-sm font-medium text-slate-700">
              List
              <select name="kind" className={`${controlClassName("mt-1 block")}`}>
                <option value="CANCELLATION">Cancellation</option>
                <option value="SICKNESS">Sickness</option>
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Reason
              <input name="label" className={controlClassName("mt-1 block")} />
            </label>
            <Button type="submit" disabled={addPending}>
              Add reason
            </Button>
          </form>
          <ReasonList kind="CANCELLATION" title="Cancellation" reasons={reasons} />
          <ReasonList kind="SICKNESS" title="Sickness" reasons={reasons} />
        </CardBody>
      </Card>
    </div>
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

function ReasonList({
  kind,
  title,
  reasons,
}: {
  kind: AbsenceReasonKind;
  title: string;
  reasons: AbsenceReason[];
}) {
  const rows = reasons.filter((reason) => reason.kind === kind);
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600">No reasons yet.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {rows.map((reason) => (
            <li key={reason.id} className="flex flex-wrap items-center gap-2">
              <form action={updateAbsenceReasonAction} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={reason.id} />
                <input
                  name="label"
                  defaultValue={reason.label}
                  className={controlClassName("w-64")}
                />
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" name="active" defaultChecked={reason.active} />
                  Active
                </label>
                <Button type="submit" variant="secondary" size="sm">
                  Save
                </Button>
              </form>
              <form action={moveAbsenceReasonAction}>
                <input type="hidden" name="id" value={reason.id} />
                <input type="hidden" name="direction" value="up" />
                <Button type="submit" variant="secondary" size="sm">
                  Up
                </Button>
              </form>
              <form action={moveAbsenceReasonAction}>
                <input type="hidden" name="id" value={reason.id} />
                <input type="hidden" name="direction" value="down" />
                <Button type="submit" variant="secondary" size="sm">
                  Down
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
