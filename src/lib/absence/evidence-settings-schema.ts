import { z } from "zod";
import {
  SICKNESS_EVIDENCE_DAY_COUNT_MESSAGE,
  parseEvidenceDayCount,
} from "@/lib/absence/evidence-policy";

const dayCount = z.string().trim().superRefine((value, ctx) => {
  const parsed = parseEvidenceDayCount(value);
  if (!parsed.ok) {
    ctx.addIssue({
      code: "custom",
      message: parsed.message || SICKNESS_EVIDENCE_DAY_COUNT_MESSAGE,
    });
  }
});

export const sicknessEvidenceSettingsSchema = z.object({
  fitNoteRequiredFromDay: dayCount,
  fitNoteChaseAfterDays: dayCount,
});

export type SicknessEvidenceSettingsInput = {
  fitNoteRequiredFromDay: number;
  fitNoteChaseAfterDays: number;
};

export function parseSicknessEvidenceSettingsFormData(formData: FormData):
  | { success: true; data: SicknessEvidenceSettingsInput }
  | { success: false; error: z.ZodError } {
  const raw = {
    fitNoteRequiredFromDay: String(formData.get("fitNoteRequiredFromDay") ?? ""),
    fitNoteChaseAfterDays: String(formData.get("fitNoteChaseAfterDays") ?? ""),
  };
  const parsed = sicknessEvidenceSettingsSchema.safeParse(raw);
  if (!parsed.success) {
    return parsed;
  }
  const required = parseEvidenceDayCount(parsed.data.fitNoteRequiredFromDay);
  const chase = parseEvidenceDayCount(parsed.data.fitNoteChaseAfterDays);
  if (!required.ok || !chase.ok) {
    const failed = sicknessEvidenceSettingsSchema.safeParse({
      fitNoteRequiredFromDay: "",
      fitNoteChaseAfterDays: "",
    });
    if (!failed.success) {
      return failed;
    }
    return {
      success: false as const,
      error: new z.ZodError([]),
    };
  }
  return {
    success: true as const,
    data: {
      fitNoteRequiredFromDay: required.value,
      fitNoteChaseAfterDays: chase.value,
    },
  };
}

export function sicknessEvidenceSettingsValues(formData: FormData) {
  return {
    fitNoteRequiredFromDay: String(formData.get("fitNoteRequiredFromDay") ?? ""),
    fitNoteChaseAfterDays: String(formData.get("fitNoteChaseAfterDays") ?? ""),
  };
}
