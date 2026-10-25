import { z } from "zod";
import { parseLocalDate } from "@/lib/events/dates";

const dateField = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `Enter a ${label}`)
    .refine((value) => parseLocalDate(value) !== null, "Enter a valid date");

export const payPeriodDatesSchema = z
  .object({
    startsOn: dateField("start date"),
    endsOn: dateField("end date"),
  })
  .superRefine((value, ctx) => {
    if (value.startsOn > value.endsOn) {
      ctx.addIssue({
        code: "custom",
        path: ["endsOn"],
        message: "The end date must be on or after the start date.",
      });
    }
  });

export type PayPeriodDatesInput = z.infer<typeof payPeriodDatesSchema>;

export function parsePayPeriodDatesFormData(formData: FormData) {
  return payPeriodDatesSchema.safeParse({
    startsOn: formData.get("startsOn") ?? "",
    endsOn: formData.get("endsOn") ?? "",
  });
}

export const changePayPeriodSchema = z.object({
  absenceId: z.string().trim().min(1, "Choose an absence"),
  payPeriodId: z.string().trim().min(1, "Choose a pay period"),
});

export function parseChangePayPeriodFormData(formData: FormData) {
  return changePayPeriodSchema.safeParse({
    absenceId: formData.get("absenceId") ?? "",
    payPeriodId: formData.get("payPeriodId") ?? "",
  });
}
