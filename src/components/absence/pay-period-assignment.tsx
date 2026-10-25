"use client";

import { useActionState, useMemo } from "react";
import {
  changeAbsencePayPeriodAction,
  type AbsenceActionState,
} from "@/app/(app)/absence/actions";
import type { PayPeriodChoice } from "@/components/absence/pay-period-field";
import { FieldError, FormAlert, selectControlClassName } from "@/components/form";
import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/field";
import { formatPayPeriodName, payPeriodStatusSuffix } from "@/lib/absence/pay-period";
import { parseChangePayPeriodFormData } from "@/lib/absence/pay-period-schema";
import { withClientValidation } from "@/lib/form";

const initialState: AbsenceActionState = {};

export function PayPeriodAssignment({
  absenceId,
  current,
  periods,
}: {
  absenceId: string;
  current: PayPeriodChoice | null;
  periods?: PayPeriodChoice[];
}) {
  const validated = useMemo(
    () => withClientValidation(parseChangePayPeriodFormData, changeAbsencePayPeriodAction),
    [],
  );
  const [state, action, pending] = useActionState(validated, initialState);
  const choices = periods ?? [];
  const canMove =
    choices.length > 0 &&
    (current === null || choices.some((period) => period.id !== current.id));

  return (
    <div className="mb-6 border-b border-border pb-6">
      <p className="text-sm font-medium text-slate-500">Pay period</p>
      <p className="mt-1 text-slate-900">
        {current ? formatPayPeriodName(current) : "Not filed in a pay period."}
      </p>
      {canMove ? (
        <form action={action} className="mt-3 grid max-w-md gap-3" noValidate>
          <input type="hidden" name="absenceId" value={absenceId} />
          <FormAlert>{state.error}</FormAlert>
          <div>
            <FieldLabel htmlFor={`${absenceId}-pay-period`} required>
              {current ? "Move to" : "File under"}
            </FieldLabel>
            <select
              id={`${absenceId}-pay-period`}
              name="payPeriodId"
              defaultValue={current?.id ?? ""}
              aria-invalid={Boolean(state.fieldErrors?.payPeriodId)}
              aria-describedby={
                state.fieldErrors?.payPeriodId
                  ? `${absenceId}-pay-period-error`
                  : undefined
              }
              className={selectControlClassName("w-full")}
            >
              {current ? null : <option value="">Choose a pay period</option>}
              {choices.map((period) => (
                <option key={period.id} value={period.id}>
                  {formatPayPeriodName(period)}
                  {payPeriodStatusSuffix(period, choices)}
                </option>
              ))}
            </select>
            <FieldError
              id={`${absenceId}-pay-period-error`}
              messages={state.fieldErrors?.payPeriodId}
            />
          </div>
          <Button type="submit" size="sm" disabled={pending}>
            {current ? "Move record" : "File record"}
          </Button>
        </form>
      ) : periods && periods.length === 0 && !current ? (
        <p className="mt-2 text-sm text-slate-600">
          Open a pay period in Settings to file this record.
        </p>
      ) : null}
    </div>
  );
}
