import { FieldError, selectControlClassName } from "@/components/form";
import { FieldLabel } from "@/components/ui/field";
import {
  formatPayPeriodName,
  payPeriodStatusSuffix,
  type PayPeriodLifecycle,
} from "@/lib/absence/pay-period";

export type PayPeriodChoice = {
  id: string;
  number: number;
  label: string;
  startsOn?: string;
  status: PayPeriodLifecycle;
};

export function PayPeriodField({
  id,
  periods,
  messages,
}: {
  id: string;
  periods: PayPeriodChoice[];
  messages?: string[];
}) {
  if (periods.length === 0) {
    return (
      <p className="text-sm text-slate-600">
        This absence will not be filed in a pay period until one is opened in
        Settings.
      </p>
    );
  }
  const open = periods.find((period) => period.status === "OPEN");
  return (
    <div>
      <FieldLabel htmlFor={id} required>
        Pay period
      </FieldLabel>
      <select
        id={id}
        name="payPeriodId"
        defaultValue={open?.id ?? periods[0]?.id}
        aria-invalid={Boolean(messages?.length)}
        aria-describedby={messages?.length ? `${id}-error` : undefined}
        className={selectControlClassName("w-full")}
      >
        {periods.map((period) => (
          <option key={period.id} value={period.id}>
            {formatPayPeriodName(period)}
            {payPeriodStatusSuffix(period, periods)}
          </option>
        ))}
      </select>
      <FieldError id={`${id}-error`} messages={messages} />
    </div>
  );
}
