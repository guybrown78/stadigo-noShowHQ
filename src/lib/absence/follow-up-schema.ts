import { z } from "zod";
import {
  ABSENCE_TYPES,
  CORRECTION_REASON_MAX_LENGTH,
  CORRECTION_REASON_MIN_LENGTH,
  FOLLOW_UP_DETAILS_MAX_LENGTH,
  FOLLOW_UP_DETAILS_MIN_LENGTH,
  FOLLOW_UP_DUE_GROUPS,
  FOLLOW_UP_QUEUE_PAGE_SIZE,
} from "@/lib/absence/catalog";
import {
  FOLLOW_UP_MARKUP_MESSAGE,
  FOLLOW_UP_MARKUP_PATTERN,
  FOLLOW_UP_OUTCOME_REUSE_MESSAGE,
  type FollowUpDueState,
} from "@/lib/absence/follow-up";
import { parseLocalDate } from "@/lib/events/dates";

const dueDateSchema = z
  .string()
  .trim()
  .min(1, "Due date is required")
  .refine((value) => parseLocalDate(value) !== null, "Enter a valid date");

const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8, "A valid save key is required")
  .max(128, "A valid save key is required");

const expectedUpdatedAtSchema = z
  .string()
  .trim()
  .min(1, "This record is out of date. Reload and try again.");

const actionReasonSchema = (label: string) =>
  z
    .string()
    .trim()
    .min(
      CORRECTION_REASON_MIN_LENGTH,
      `${label} must be at least ${CORRECTION_REASON_MIN_LENGTH} characters`,
    )
    .max(
      CORRECTION_REASON_MAX_LENGTH,
      `${label} must be ${CORRECTION_REASON_MAX_LENGTH} characters or fewer`,
    );

function followUpTextSchema(label: string) {
  return z
    .string()
    .trim()
    .min(
      FOLLOW_UP_DETAILS_MIN_LENGTH,
      `${label} must be at least ${FOLLOW_UP_DETAILS_MIN_LENGTH} characters`,
    )
    .max(
      FOLLOW_UP_DETAILS_MAX_LENGTH,
      `${label} must be ${FOLLOW_UP_DETAILS_MAX_LENGTH.toLocaleString()} characters or fewer`,
    )
    .refine((value) => !FOLLOW_UP_MARKUP_PATTERN.test(value), FOLLOW_UP_MARKUP_MESSAGE);
}

export const createFollowUpSchema = z.object({
  absenceId: z.string().trim().min(1, "Choose an absence"),
  dueDate: dueDateSchema,
  details: followUpTextSchema("Follow-up details"),
  idempotencyKey: idempotencyKeySchema,
});

export const updateFollowUpSchema = z.object({
  followUpId: z.string().trim().min(1, "Choose a follow-up"),
  dueDate: dueDateSchema,
  details: followUpTextSchema("Follow-up details"),
  correctionReason: actionReasonSchema("Correction reason"),
  expectedUpdatedAt: expectedUpdatedAtSchema,
  idempotencyKey: idempotencyKeySchema,
});

export function completeFollowUpSchema(currentDetails?: string) {
  return z
    .object({
      followUpId: z.string().trim().min(1, "Choose a follow-up"),
      completionNotes: followUpTextSchema("Outcome"),
      expectedUpdatedAt: expectedUpdatedAtSchema,
      idempotencyKey: idempotencyKeySchema,
    })
    .superRefine((value, ctx) => {
      if (
        currentDetails != null &&
        value.completionNotes === currentDetails.trim()
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["completionNotes"],
          message: FOLLOW_UP_OUTCOME_REUSE_MESSAGE,
        });
      }
    });
}

export const cancelFollowUpSchema = z.object({
  followUpId: z.string().trim().min(1, "Choose a follow-up"),
  cancellationReason: actionReasonSchema("Cancellation reason"),
  expectedUpdatedAt: expectedUpdatedAtSchema,
  idempotencyKey: idempotencyKeySchema,
});

export type CreateFollowUpInput = z.infer<typeof createFollowUpSchema>;
export type UpdateFollowUpInput = z.infer<typeof updateFollowUpSchema>;
export type CompleteFollowUpInput = z.infer<
  ReturnType<typeof completeFollowUpSchema>
>;
export type CancelFollowUpInput = z.infer<typeof cancelFollowUpSchema>;

export function parseCreateFollowUpFormData(formData: FormData) {
  return createFollowUpSchema.safeParse({
    absenceId: formData.get("absenceId") ?? "",
    dueDate: formData.get("dueDate") ?? "",
    details: formData.get("details") ?? "",
    idempotencyKey: formData.get("idempotencyKey") ?? "",
  });
}

export function parseUpdateFollowUpFormData(formData: FormData) {
  return updateFollowUpSchema.safeParse({
    followUpId: formData.get("followUpId") ?? "",
    dueDate: formData.get("dueDate") ?? "",
    details: formData.get("details") ?? "",
    correctionReason: formData.get("correctionReason") ?? "",
    expectedUpdatedAt: formData.get("expectedUpdatedAt") ?? "",
    idempotencyKey: formData.get("idempotencyKey") ?? "",
  });
}

export function parseCompleteFollowUpFormData(
  formData: FormData,
  currentDetails?: string,
) {
  return completeFollowUpSchema(currentDetails).safeParse({
    followUpId: formData.get("followUpId") ?? "",
    completionNotes: formData.get("completionNotes") ?? "",
    expectedUpdatedAt: formData.get("expectedUpdatedAt") ?? "",
    idempotencyKey: formData.get("idempotencyKey") ?? "",
  });
}

export function parseCancelFollowUpFormData(formData: FormData) {
  return cancelFollowUpSchema.safeParse({
    followUpId: formData.get("followUpId") ?? "",
    cancellationReason: formData.get("cancellationReason") ?? "",
    expectedUpdatedAt: formData.get("expectedUpdatedAt") ?? "",
    idempotencyKey: formData.get("idempotencyKey") ?? "",
  });
}

export type FollowUpQueueQuery = {
  q: string;
  type: (typeof ABSENCE_TYPES)[number] | "";
  due: FollowUpDueState | "";
  page: number;
  detail: string;
};

export function parseFollowUpQueueQuery(raw: {
  q?: string;
  type?: string;
  due?: string;
  page?: string;
  detail?: string;
}): FollowUpQueueQuery {
  const type = ABSENCE_TYPES.find((value) => value === raw.type?.trim()) ?? "";
  const due =
    FOLLOW_UP_DUE_GROUPS.find((value) => value === raw.due?.trim()) ?? "";
  const pageNumber = Number.parseInt(raw.page ?? "1", 10);
  return {
    q: (raw.q ?? "").trim().slice(0, 200),
    type,
    due,
    page: Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : 1,
    detail: (raw.detail ?? "").trim(),
  };
}

export function followUpQueueHasFilters(query: FollowUpQueueQuery): boolean {
  return Boolean(query.q || query.type || query.due);
}

export { FOLLOW_UP_QUEUE_PAGE_SIZE };
