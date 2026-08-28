import { z } from "zod";
import { parseLocalDate } from "@/lib/events/dates";
import {
  MAX_PROBATION_DAYS,
  PROBATION_REVIEW_OUTCOMES,
} from "@/lib/staff/catalog";
import { emptyToNull } from "@/lib/staff/normalize";

const localDate = z
  .string()
  .trim()
  .refine((value) => parseLocalDate(value) !== null, "Enter a valid date");

const optionalNotes = z
  .string()
  .transform((value) => emptyToNull(value))
  .refine(
    (value) => value === null || value.length <= 2000,
    "Notes must be 2,000 characters or fewer",
  );

export const tenantProbationSettingsSchema = z.object({
  defaultProbationDays: z
    .string()
    .trim()
    .refine((value) => /^\d+$/.test(value), "Enter a whole number of days")
    .transform((value) => Number(value))
    .refine(
      (value) => value >= 1 && value <= MAX_PROBATION_DAYS,
      `Enter a whole number between 1 and ${MAX_PROBATION_DAYS} days`,
    ),
});

export type TenantProbationSettingsInput = z.infer<
  typeof tenantProbationSettingsSchema
>;

export function parseTenantProbationSettingsFormData(formData: FormData) {
  return tenantProbationSettingsSchema.safeParse({
    defaultProbationDays: formData.get("defaultProbationDays") ?? "",
  });
}

export const reviewProbationSchema = z
  .object({
    reviewDate: localDate,
    outcome: z.enum(PROBATION_REVIEW_OUTCOMES),
    notes: optionalNotes,
    newEndDate: z
      .string()
      .trim()
      .transform((value) => (value === "" ? null : value))
      .refine(
        (value) => value === null || parseLocalDate(value) !== null,
        "Enter a valid date",
      ),
  })
  .superRefine((data, ctx) => {
    if (data.outcome === "EXTENDED") {
      if (!data.notes) {
        ctx.addIssue({
          code: "custom",
          path: ["notes"],
          message: "Enter notes explaining the extension",
        });
      }
      if (!data.newEndDate) {
        ctx.addIssue({
          code: "custom",
          path: ["newEndDate"],
          message: "Enter a new probation end date",
        });
      }
    }
    if (data.outcome === "NOT_CONTINUED" && !data.notes) {
      ctx.addIssue({
        code: "custom",
        path: ["notes"],
        message: "Enter notes for a not-continued decision",
      });
    }
  });

export type ReviewProbationInput = z.infer<typeof reviewProbationSchema>;

export function parseReviewProbationFormData(formData: FormData) {
  return reviewProbationSchema.safeParse({
    reviewDate: formData.get("reviewDate") ?? "",
    outcome: formData.get("outcome") ?? "",
    notes: formData.get("notes") ?? "",
    newEndDate: formData.get("newEndDate") ?? "",
  });
}

export const amendProbationEndSchema = z.object({
  newEndDate: localDate,
  reason: z
    .string()
    .transform((value) => value.trim())
    .pipe(
      z
        .string()
        .min(1, "Enter a reason for changing the end date")
        .max(2000, "Reason must be 2,000 characters or fewer"),
    ),
});

export function parseAmendProbationEndFormData(formData: FormData) {
  return amendProbationEndSchema.safeParse({
    newEndDate: formData.get("newEndDate") ?? "",
    reason: formData.get("reason") ?? "",
  });
}

export const snoozeProbationTaskSchema = z.object({
  snoozedUntil: localDate,
  reason: z
    .string()
    .transform((value) => value.trim())
    .pipe(
      z
        .string()
        .min(1, "Enter a reason for snoozing")
        .max(2000, "Reason must be 2,000 characters or fewer"),
    ),
});

export function parseSnoozeProbationTaskFormData(formData: FormData) {
  return snoozeProbationTaskSchema.safeParse({
    snoozedUntil: formData.get("snoozedUntil") ?? "",
    reason: formData.get("reason") ?? "",
  });
}

export { flattenFieldErrors } from "@/lib/form";
