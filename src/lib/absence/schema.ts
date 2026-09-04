import { z } from "zod";
import { calculateNotice, coerceLocalDateIso } from "@/lib/absence/notice";
import {
  ARCHIVE_REASON_MAX_LENGTH,
  ARCHIVE_REASON_MIN_LENGTH,
  CORRECTION_REASON_MAX_LENGTH,
  CORRECTION_REASON_MIN_LENGTH,
  DEFAULT_LEDGER_DIRECTION,
  DEFAULT_LEDGER_SORT,
  LEDGER_SORT_DIRECTIONS,
  LEDGER_SORT_FIELDS,
  NOTES_MAX_LENGTH,
  REASON_MAX_LENGTH,
  REASON_MIN_LENGTH,
  type LedgerSortDirection,
  type LedgerSortField,
} from "@/lib/absence/catalog";
import { parseLocalDate, parseLocalTime } from "@/lib/events/dates";
import { emptyToNull } from "@/lib/staff/normalize";

const localDateSchema = z
  .string()
  .trim()
  .min(1, "Reported date is required")
  .refine((value) => parseLocalDate(value) !== null, "Enter a valid date");

const optionalTimeSchema = z
  .string()
  .refine((value) => {
    const trimmed = value.trim();
    return !trimmed || parseLocalTime(trimmed) !== null;
  }, "Enter a valid time")
  .transform((value) => parseLocalTime(value.trim()));

const optionalNotesSchema = z
  .string()
  .transform((value) => emptyToNull(value))
  .refine(
    (value) => value === null || value.length <= NOTES_MAX_LENGTH,
    `Notes must be ${NOTES_MAX_LENGTH.toLocaleString()} characters or fewer`,
  );

const reasonSchema = z
  .string()
  .trim()
  .min(
    REASON_MIN_LENGTH,
    `Reason must be at least ${REASON_MIN_LENGTH} characters`,
  )
  .max(
    REASON_MAX_LENGTH,
    `Reason must be ${REASON_MAX_LENGTH.toLocaleString()} characters or fewer`,
  );

const actionReasonSchema = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min, `${label} must be at least ${min} characters`)
    .max(max, `${label} must be ${max} characters or fewer`);

const cancellationFields = {
  type: z.literal("CANCELLATION", {
    error: "Only Cancellation can be logged in this release",
  }),
  staffId: z.string().trim().min(1, "Select a staff member"),
  eventId: z.string().trim().min(1, "Select an event"),
  reportedDate: localDateSchema,
  reportedTime: optionalTimeSchema,
  reason: reasonSchema,
  notes: optionalNotesSchema,
  retrospectiveConfirmed: z.boolean(),
  eventDate: z.string().optional(),
  eventStartTime: z.string().optional(),
};

function refineRetrospective(
  value: {
    reportedDate: string;
    reportedTime: string | null;
    retrospectiveConfirmed: boolean;
    eventDate?: string;
    eventStartTime?: string;
  },
  ctx: z.RefinementCtx,
) {
  const eventDate = coerceLocalDateIso(value.eventDate?.trim() ?? "");
  if (!eventDate) {
    return;
  }
  const notice = calculateNotice({
    eventDate,
    eventStartTime: value.eventStartTime ?? null,
    reportedDate: value.reportedDate,
    reportedTime: value.reportedTime,
  });
  if (notice.isRetrospective && !value.retrospectiveConfirmed) {
    ctx.addIssue({
      code: "custom",
      path: ["retrospectiveConfirmed"],
      message: "Confirm this is a retrospective or late record",
    });
  }
}

export const cancellationInputSchema = z
  .object(cancellationFields)
  .superRefine(refineRetrospective);

export const correctCancellationInputSchema = z
  .object({
    ...cancellationFields,
    correctionReason: actionReasonSchema(
      "Correction reason",
      CORRECTION_REASON_MIN_LENGTH,
      CORRECTION_REASON_MAX_LENGTH,
    ),
  })
  .superRefine(refineRetrospective);

export const archiveCancellationInputSchema = z.object({
  archiveReason: actionReasonSchema(
    "Archive reason",
    ARCHIVE_REASON_MIN_LENGTH,
    ARCHIVE_REASON_MAX_LENGTH,
  ),
  confirmArchive: z.literal(true, {
    error: "Confirm that you want to archive this cancellation",
  }),
});

export type CancellationInput = Omit<
  z.infer<typeof cancellationInputSchema>,
  "eventDate" | "eventStartTime"
>;

export type CorrectCancellationInput = Omit<
  z.infer<typeof correctCancellationInputSchema>,
  "eventDate" | "eventStartTime"
>;

export type ArchiveCancellationInput = z.infer<
  typeof archiveCancellationInputSchema
>;

function formObject(formData: FormData) {
  return {
    type: formData.get("type") ?? "CANCELLATION",
    staffId: formData.get("staffId") ?? "",
    eventId: formData.get("eventId") ?? "",
    reportedDate: formData.get("reportedDate") ?? "",
    reportedTime: formData.get("reportedTime") ?? "",
    reason: formData.get("reason") ?? "",
    notes: formData.get("notes") ?? "",
    retrospectiveConfirmed: formData.get("retrospectiveConfirmed") === "on",
    eventDate: String(formData.get("eventDate") ?? ""),
    eventStartTime: String(formData.get("eventStartTime") ?? ""),
  };
}

export function parseCancellationFormData(formData: FormData) {
  return cancellationInputSchema.safeParse(formObject(formData));
}

export function parseCorrectCancellationFormData(formData: FormData) {
  return correctCancellationInputSchema.safeParse({
    ...formObject(formData),
    correctionReason: formData.get("correctionReason") ?? "",
  });
}

export function parseArchiveCancellationFormData(formData: FormData) {
  return archiveCancellationInputSchema.safeParse({
    archiveReason: formData.get("archiveReason") ?? "",
    confirmArchive: formData.get("confirmArchive") === "on",
  });
}

export { flattenFieldErrors } from "@/lib/form";

const LEDGER_SORT_FIELD_SET = new Set<string>(LEDGER_SORT_FIELDS);
const LEDGER_SORT_DIRECTION_SET = new Set<string>(LEDGER_SORT_DIRECTIONS);

function optionalLedgerDate(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return parseLocalDate(trimmed) ? trimmed : "";
}

function optionalLedgerSort(value: unknown): LedgerSortField {
  if (typeof value === "string" && LEDGER_SORT_FIELD_SET.has(value)) {
    return value as LedgerSortField;
  }
  return DEFAULT_LEDGER_SORT;
}

function optionalLedgerDirection(value: unknown): LedgerSortDirection {
  if (typeof value === "string" && LEDGER_SORT_DIRECTION_SET.has(value)) {
    return value as LedgerSortDirection;
  }
  return DEFAULT_LEDGER_DIRECTION;
}

function optionalLedgerPage(value: unknown): number {
  const raw =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : 1;
  if (!Number.isInteger(raw) || raw < 1) {
    return 1;
  }
  return raw;
}

export const ledgerListQuerySchema = z.object({
  q: z.string().max(160),
  venue: z.string(),
  eventType: z.string(),
  reportedFrom: z.string(),
  reportedTo: z.string(),
  sort: z.enum(LEDGER_SORT_FIELDS),
  direction: z.enum(LEDGER_SORT_DIRECTIONS),
  page: z.number().int().min(1),
  view: z.string(),
});

export type LedgerListQuery = z.infer<typeof ledgerListQuerySchema>;

export const defaultLedgerListQuery = (): LedgerListQuery => ({
  q: "",
  venue: "",
  eventType: "",
  reportedFrom: "",
  reportedTo: "",
  sort: DEFAULT_LEDGER_SORT,
  direction: DEFAULT_LEDGER_DIRECTION,
  page: 1,
  view: "cancellations",
});

export function parseLedgerListQuery(raw: {
  q?: string;
  venue?: string;
  eventType?: string;
  reportedFrom?: string;
  reportedTo?: string;
  sort?: string;
  direction?: string;
  page?: string;
  view?: string;
}): LedgerListQuery {
  const parsed = ledgerListQuerySchema.safeParse({
    q: typeof raw.q === "string" ? raw.q.trim().slice(0, 160) : "",
    venue: typeof raw.venue === "string" ? raw.venue.trim() : "",
    eventType: typeof raw.eventType === "string" ? raw.eventType.trim() : "",
    reportedFrom: optionalLedgerDate(raw.reportedFrom),
    reportedTo: optionalLedgerDate(raw.reportedTo),
    sort: optionalLedgerSort(raw.sort),
    direction: optionalLedgerDirection(raw.direction),
    page: optionalLedgerPage(raw.page),
    view:
      typeof raw.view === "string" && raw.view.trim()
        ? raw.view.trim()
        : "cancellations",
  });
  return parsed.success ? parsed.data : defaultLedgerListQuery();
}

export function isLedgerDateRangeInvalid(query: LedgerListQuery): boolean {
  return Boolean(
    query.reportedFrom &&
      query.reportedTo &&
      query.reportedFrom > query.reportedTo,
  );
}
