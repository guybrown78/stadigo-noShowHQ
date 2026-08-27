import { z } from "zod";
import { parseLocalDate } from "@/lib/events/dates";
import {
  EMPLOYMENT_STATUSES,
  MAX_PROBATION_DAYS,
  PROBATION_STATUSES,
  SECURITY_CLEARANCE_STATUSES,
} from "@/lib/staff/catalog";
import { emptyToNull, normalizePersonName, normalizeStaffIdNumber } from "@/lib/staff/normalize";

function optionalTrimmed(max: number, message: string) {
  return z
    .string()
    .transform((value) => emptyToNull(value))
    .refine((value) => value === null || value.length <= max, message);
}

const optionalLocalDate = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .refine(
    (value) => value === null || parseLocalDate(value) !== null,
    "Enter a valid date",
  );

const optionalPositiveInt = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .refine(
    (value) => value === null || /^\d+$/.test(value),
    "Enter a whole number of days",
  )
  .transform((value) => (value === null ? null : Number(value)))
  .refine(
    (value) =>
      value === null || (value >= 1 && value <= MAX_PROBATION_DAYS),
    `Probation duration must be between 1 and ${MAX_PROBATION_DAYS} days`,
  );

export const staffInputSchema = z
  .object({
    staffIdNumber: z
      .string()
      .transform((value) => normalizeStaffIdNumber(value))
      .pipe(
        z
          .string()
          .min(1, "Staff ID is required")
          .max(80, "Staff ID must be 80 characters or fewer"),
      ),
    firstName: z
      .string()
      .transform((value) => normalizePersonName(value))
      .pipe(
        z
          .string()
          .min(1, "First name is required")
          .max(80, "First name must be 80 characters or fewer"),
      ),
    lastName: z
      .string()
      .transform((value) => normalizePersonName(value))
      .pipe(
        z
          .string()
          .min(1, "Last name is required")
          .max(80, "Last name must be 80 characters or fewer"),
      ),
    email: z
      .string()
      .trim()
      .transform((value) => emptyToNull(value))
      .refine(
        (value) => value === null || value.length <= 254,
        "Email must be 254 characters or fewer",
      )
      .refine(
        (value) => value === null || z.string().email().safeParse(value).success,
        "Enter a valid email address",
      )
      .transform((value) => (value ? value.toLowerCase() : null)),
    phone: z
      .string()
      .transform((value) => emptyToNull(value))
      .refine(
        (value) =>
          value === null || (value.length >= 5 && value.length <= 40),
        "Phone must be between 5 and 40 characters",
      ),
    department: optionalTrimmed(
      100,
      "Department must be 100 characters or fewer",
    ),
    roleTitle: z
      .string()
      .transform((value) => normalizePersonName(value))
      .pipe(
        z
          .string()
          .min(2, "Role must be at least 2 characters")
          .max(120, "Role must be 120 characters or fewer"),
      ),
    managerStaffId: z.string().transform((value) => emptyToNull(value)),
    employmentStatus: z.enum(EMPLOYMENT_STATUSES),
    startDate: optionalLocalDate,
    applyProbation: z.boolean(),
    probationLengthDays: optionalPositiveInt,
    overrideProbationEndDate: z.boolean(),
    probationEndDate: optionalLocalDate,
    probationStatus: z.enum(PROBATION_STATUSES),
    securityClearanceStatus: z.enum(SECURITY_CLEARANCE_STATUSES),
    securityClearanceExpiryDate: optionalLocalDate,
    notes: optionalTrimmed(2000, "Notes must be 2,000 characters or fewer"),
  })
  .superRefine((data, ctx) => {
    if (
      (data.securityClearanceStatus === "VALID" ||
        data.securityClearanceStatus === "EXPIRED") &&
      !data.securityClearanceExpiryDate
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["securityClearanceExpiryDate"],
        message: "Enter an expiry date for this clearance status",
      });
    }

    if (
      data.applyProbation &&
      data.overrideProbationEndDate &&
      !data.probationEndDate
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["probationEndDate"],
        message: "Enter a probation end date",
      });
    }

    if (
      data.applyProbation &&
      !data.overrideProbationEndDate &&
      !data.startDate
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["startDate"],
        message: "Enter a start date, or set a probation end date",
      });
    }
  });

export type StaffInput = z.infer<typeof staffInputSchema>;

export const staffListQuerySchema = z.object({
  q: z.string().trim().max(160).optional().default(""),
  employmentStatus: z
    .enum(["", ...EMPLOYMENT_STATUSES])
    .optional()
    .default(""),
  department: z.string().trim().optional().default(""),
  probationStatus: z
    .enum(["", ...PROBATION_STATUSES])
    .optional()
    .default(""),
  clearanceStatus: z
    .enum(["", ...SECURITY_CLEARANCE_STATUSES])
    .optional()
    .default(""),
  page: z.coerce.number().int().min(1).optional().default(1),
});

export type StaffListQuery = z.infer<typeof staffListQuerySchema>;

export function parseStaffFormData(formData: FormData) {
  const applyProbation = formData.get("applyProbation") === "on";
  return staffInputSchema.safeParse({
    staffIdNumber: formData.get("staffIdNumber") ?? "",
    firstName: formData.get("firstName") ?? "",
    lastName: formData.get("lastName") ?? "",
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
    department: formData.get("department") ?? "",
    roleTitle: formData.get("roleTitle") ?? "",
    managerStaffId: formData.get("managerStaffId") ?? "",
    employmentStatus: formData.get("employmentStatus") ?? "ACTIVE",
    startDate: formData.get("startDate") ?? "",
    applyProbation,
    probationLengthDays: formData.get("probationLengthDays") ?? "",
    overrideProbationEndDate: formData.get("overrideProbationEndDate") === "on",
    probationEndDate: formData.get("probationEndDate") ?? "",
    probationStatus:
      formData.get("probationStatus") ||
      (applyProbation ? "IN_PROGRESS" : "NOT_APPLICABLE"),
    securityClearanceStatus:
      formData.get("securityClearanceStatus") ?? "NOT_RECORDED",
    securityClearanceExpiryDate:
      formData.get("securityClearanceExpiryDate") ?? "",
    notes: formData.get("notes") ?? "",
  });
}

export { flattenFieldErrors } from "@/lib/form";
