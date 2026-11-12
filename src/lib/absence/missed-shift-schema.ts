import { z } from "zod";

const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8, "A valid save key is required")
  .max(128, "A valid save key is required");

export const addMissedShiftSchema = z.object({
  absenceId: z.string().trim().min(1, "Choose a sickness record"),
  eventId: z.string().trim().min(1, "Select a booked shift"),
  idempotencyKey: idempotencyKeySchema,
});

export const removeMissedShiftSchema = z.object({
  absenceId: z.string().trim().min(1, "Choose a sickness record"),
  shiftId: z.string().trim().min(1, "Choose a shift"),
  idempotencyKey: idempotencyKeySchema,
});

export type AddMissedShiftInput = z.infer<typeof addMissedShiftSchema>;
export type RemoveMissedShiftInput = z.infer<typeof removeMissedShiftSchema>;

export function parseAddMissedShiftFormData(formData: FormData) {
  return addMissedShiftSchema.safeParse({
    absenceId: formData.get("absenceId") ?? "",
    eventId: formData.get("eventId") ?? "",
    idempotencyKey: formData.get("idempotencyKey") ?? "",
  });
}

export function parseRemoveMissedShiftFormData(formData: FormData) {
  return removeMissedShiftSchema.safeParse({
    absenceId: formData.get("absenceId") ?? "",
    shiftId: formData.get("shiftId") ?? "",
    idempotencyKey: formData.get("idempotencyKey") ?? "",
  });
}
