import { z } from "zod";
import {
  CORRECTION_REASON_MAX_LENGTH,
  CORRECTION_REASON_MIN_LENGTH,
  NOTES_MAX_LENGTH,
  RETURN_TO_WORK_STATUSES,
} from "@/lib/absence/catalog";
import {
  RETURN_TO_WORK_MARKUP_MESSAGE,
  RETURN_TO_WORK_MARKUP_PATTERN,
  returnToWorkDateFieldErrors,
} from "@/lib/absence/return-to-work";

const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8, "A valid save key is required")
  .max(128, "A valid save key is required");

const optionalText = z.string().trim();

function correctionReasonIssues(reason: string): string | null {
  if (reason.length < CORRECTION_REASON_MIN_LENGTH) {
    return `Correction reason must be at least ${CORRECTION_REASON_MIN_LENGTH} characters`;
  }
  if (reason.length > CORRECTION_REASON_MAX_LENGTH) {
    return `Correction reason must be ${CORRECTION_REASON_MAX_LENGTH} characters or fewer`;
  }
  return null;
}

const noteSchema = z
  .string()
  .trim()
  .max(
    NOTES_MAX_LENGTH,
    `Note must be ${NOTES_MAX_LENGTH.toLocaleString()} characters or fewer`,
  )
  .refine((value) => value === "" || !RETURN_TO_WORK_MARKUP_PATTERN.test(value), {
    message: RETURN_TO_WORK_MARKUP_MESSAGE,
  });

export function saveReturnToWorkSchema(todayIso?: string) {
  return z
    .object({
      absenceId: z.string().trim().min(1, "Choose a sickness record"),
      status: z.enum(RETURN_TO_WORK_STATUSES, {
        error: "Choose a return-to-work status",
      }),
      completedOn: optionalText,
      note: noteSchema,
      correctionReason: optionalText,
      expectedUpdatedAt: optionalText,
      idempotencyKey: idempotencyKeySchema,
    })
    .superRefine((value, ctx) => {
      const fieldErrors = returnToWorkDateFieldErrors({
        status: value.status,
        completedOn: value.completedOn,
        todayIso,
      });
      for (const [field, messages] of Object.entries(fieldErrors)) {
        for (const message of messages) {
          ctx.addIssue({ code: "custom", path: [field], message });
        }
      }
      if (!value.expectedUpdatedAt) {
        return;
      }
      const reasonError = correctionReasonIssues(value.correctionReason);
      if (reasonError) {
        ctx.addIssue({
          code: "custom",
          path: ["correctionReason"],
          message: reasonError,
        });
      }
      if (Number.isNaN(Date.parse(value.expectedUpdatedAt))) {
        ctx.addIssue({
          code: "custom",
          path: ["expectedUpdatedAt"],
          message: "This record is out of date. Reload and try again.",
        });
      }
    });
}

export type SaveReturnToWorkInput = z.infer<
  ReturnType<typeof saveReturnToWorkSchema>
>;

export function parseSaveReturnToWorkFormData(
  formData: FormData,
  todayIso?: string,
) {
  return saveReturnToWorkSchema(todayIso).safeParse({
    absenceId: formData.get("absenceId") ?? "",
    status: formData.get("status") ?? "",
    completedOn: formData.get("completedOn") ?? "",
    note: formData.get("note") ?? "",
    correctionReason: formData.get("correctionReason") ?? "",
    expectedUpdatedAt: formData.get("expectedUpdatedAt") ?? "",
    idempotencyKey: formData.get("idempotencyKey") ?? "",
  });
}
