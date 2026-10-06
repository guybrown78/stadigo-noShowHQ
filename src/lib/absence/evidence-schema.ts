import { z } from "zod";
import {
  CORRECTION_REASON_MAX_LENGTH,
  CORRECTION_REASON_MIN_LENGTH,
  FIT_NOTE_STATUSES,
  NOTES_MAX_LENGTH,
  SELF_CERTIFICATION_STATUSES,
} from "@/lib/absence/catalog";
import {
  EVIDENCE_MARKUP_MESSAGE,
  EVIDENCE_MARKUP_PATTERN,
  fitNoteDateFieldErrors,
} from "@/lib/absence/evidence";

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
  .refine((value) => value === "" || !EVIDENCE_MARKUP_PATTERN.test(value), {
    message: EVIDENCE_MARKUP_MESSAGE,
  });

export function saveSelfCertificationSchema() {
  return z
    .object({
      absenceId: z.string().trim().min(1, "Choose a sickness record"),
      status: z.enum(SELF_CERTIFICATION_STATUSES, {
        error: "Choose a self-certification status",
      }),
      correctionReason: optionalText,
      expectedUpdatedAt: optionalText,
      idempotencyKey: idempotencyKeySchema,
    })
    .superRefine((value, ctx) => {
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

function fitNoteObject(todayIso?: string) {
  return z
    .object({
      status: z.enum(FIT_NOTE_STATUSES, {
        error: "Choose a fit note status",
      }),
      requestedDate: optionalText,
      receivedDate: optionalText,
      note: noteSchema,
    })
    .superRefine((value, ctx) => {
      const fieldErrors = fitNoteDateFieldErrors({
        status: value.status,
        requestedDate: value.requestedDate,
        receivedDate: value.receivedDate,
        todayIso,
      });
      for (const [field, messages] of Object.entries(fieldErrors)) {
        for (const message of messages) {
          ctx.addIssue({ code: "custom", path: [field], message });
        }
      }
    });
}

export function createFitNoteSchema(todayIso?: string) {
  return fitNoteObject(todayIso).safeExtend({
    absenceId: z.string().trim().min(1, "Choose a sickness record"),
    idempotencyKey: idempotencyKeySchema,
  });
}

export function updateFitNoteSchema(todayIso?: string) {
  return fitNoteObject(todayIso)
    .safeExtend({
      fitNoteId: z.string().trim().min(1, "Choose a fit note"),
      correctionReason: optionalText,
      expectedUpdatedAt: optionalText,
      idempotencyKey: idempotencyKeySchema,
    })
    .superRefine((value, ctx) => {
      const reasonError = correctionReasonIssues(value.correctionReason);
      if (reasonError) {
        ctx.addIssue({
          code: "custom",
          path: ["correctionReason"],
          message: reasonError,
        });
      }
      if (!value.expectedUpdatedAt || Number.isNaN(Date.parse(value.expectedUpdatedAt))) {
        ctx.addIssue({
          code: "custom",
          path: ["expectedUpdatedAt"],
          message: "This record is out of date. Reload and try again.",
        });
      }
    });
}

export type SaveSelfCertificationInput = z.infer<
  ReturnType<typeof saveSelfCertificationSchema>
>;
export type CreateFitNoteInput = z.infer<ReturnType<typeof createFitNoteSchema>>;
export type UpdateFitNoteInput = z.infer<ReturnType<typeof updateFitNoteSchema>>;

export function parseSaveSelfCertificationFormData(formData: FormData) {
  return saveSelfCertificationSchema().safeParse({
    absenceId: formData.get("absenceId") ?? "",
    status: formData.get("status") ?? "",
    correctionReason: formData.get("correctionReason") ?? "",
    expectedUpdatedAt: formData.get("expectedUpdatedAt") ?? "",
    idempotencyKey: formData.get("idempotencyKey") ?? "",
  });
}

export function parseCreateFitNoteFormData(formData: FormData, todayIso?: string) {
  return createFitNoteSchema(todayIso).safeParse({
    absenceId: formData.get("absenceId") ?? "",
    status: formData.get("status") ?? "",
    requestedDate: formData.get("requestedDate") ?? "",
    receivedDate: formData.get("receivedDate") ?? "",
    note: formData.get("note") ?? "",
    idempotencyKey: formData.get("idempotencyKey") ?? "",
  });
}

export function parseUpdateFitNoteFormData(formData: FormData, todayIso?: string) {
  return updateFitNoteSchema(todayIso).safeParse({
    fitNoteId: formData.get("fitNoteId") ?? "",
    status: formData.get("status") ?? "",
    requestedDate: formData.get("requestedDate") ?? "",
    receivedDate: formData.get("receivedDate") ?? "",
    note: formData.get("note") ?? "",
    correctionReason: formData.get("correctionReason") ?? "",
    expectedUpdatedAt: formData.get("expectedUpdatedAt") ?? "",
    idempotencyKey: formData.get("idempotencyKey") ?? "",
  });
}
