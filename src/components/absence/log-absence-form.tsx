"use client";

import { useState } from "react";
import { AbsenceTypeSelector, type LogAbsenceType } from "@/components/absence/absence-type-selector";
import { AwolForm } from "@/components/absence/awol-form";
import { CancellationForm } from "@/components/absence/cancellation-form";
import { Card, CardBody } from "@/components/ui/card";
import type { AbsenceEventOption, AbsenceStaffOption } from "@/lib/absence/queries";

export function LogAbsenceForm({
  initialType = "CANCELLATION",
  defaultReportedDate,
  timeZone,
  initialStaff,
  cancelHref,
}: {
  initialType?: LogAbsenceType;
  defaultReportedDate: string;
  timeZone: string;
  initialStaff?: AbsenceStaffOption | null;
  cancelHref?: string;
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
        />
      )}
    </div>
  );
}

export type { AbsenceEventOption };
