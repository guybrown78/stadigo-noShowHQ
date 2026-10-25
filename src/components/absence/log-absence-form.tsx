"use client";

import { useState } from "react";
import { AbsenceTypeSelector, type LogAbsenceType } from "@/components/absence/absence-type-selector";
import { AwolForm } from "@/components/absence/awol-form";
import { CancellationForm } from "@/components/absence/cancellation-form";
import { SicknessForm } from "@/components/absence/sickness-form";
import { Card, CardBody } from "@/components/ui/card";
import type { PayPeriodChoice } from "@/components/absence/pay-period-field";
import type { AbsenceStaffOption } from "@/lib/absence/queries";

export function LogAbsenceForm({
  initialType = "CANCELLATION",
  defaultReportedDate,
  timeZone,
  initialStaff,
  cancelHref,
  cancellationReasons = [],
  sicknessReasons = [],
  shortNoticeHours,
  payPeriods = [],
}: {
  initialType?: LogAbsenceType;
  defaultReportedDate: string;
  timeZone: string;
  initialStaff?: AbsenceStaffOption | null;
  cancelHref?: string;
  cancellationReasons?: { label: string }[];
  sicknessReasons?: { label: string }[];
  shortNoticeHours?: number;
  payPeriods?: PayPeriodChoice[];
}) {
  const [type, setType] = useState<LogAbsenceType>(initialType);
  const [staff, setStaff] = useState<AbsenceStaffOption | null>(
    initialStaff ?? null,
  );

  return (
    <div className="space-y-6">
      <Card className="shadow-none">
        <CardBody className="space-y-4">
          <h2 className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
            1 — What type of absence?
          </h2>
          <AbsenceTypeSelector value={type} onChange={setType} />
        </CardBody>
      </Card>
      {type === "AWOL" ? (
        <AwolForm
          key={`awol-${staff?.id ?? "none"}`}
          mode="create"
          hideTypeSelector
          defaultReportedDate={defaultReportedDate}
          timeZone={timeZone}
          initialStaff={staff}
          cancelHref={cancelHref}
          onStaffChange={setStaff}
          payPeriods={payPeriods}
        />
      ) : type === "SICKNESS" ? (
        <SicknessForm
          key={`sickness-${staff?.id ?? "none"}`}
          mode="create"
          hideTypeSelector
          defaultReportedDate={defaultReportedDate}
          timeZone={timeZone}
          initialStaff={staff}
          cancelHref={cancelHref}
          onStaffChange={setStaff}
          reasons={sicknessReasons}
          payPeriods={payPeriods}
        />
      ) : (
        <CancellationForm
          key={`cancellation-${staff?.id ?? "none"}`}
          mode="create"
          hideTypeSelector
          defaultReportedDate={defaultReportedDate}
          initialStaff={staff}
          cancelHref={cancelHref}
          onStaffChange={setStaff}
          reasons={cancellationReasons}
          shortNoticeHours={shortNoticeHours}
          payPeriods={payPeriods}
        />
      )}
    </div>
  );
}
