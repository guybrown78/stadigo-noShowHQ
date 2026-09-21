import { z } from "zod";
import { calculateNotice, coerceLocalDateIso } from "@/lib/absence/notice";
import {
  ALL_LEDGER_SORT_FIELDS,
  ARCHIVE_REASON_MAX_LENGTH,
  ARCHIVE_REASON_MIN_LENGTH,
  CORRECTION_REASON_MAX_LENGTH,
  CORRECTION_REASON_MIN_LENGTH,
  DEFAULT_LEDGER_DIRECTION,
  DEFAULT_LEDGER_VIEW,
  ISSUE_SUMMARY_MAX_CODE_POINTS,
  LEDGER_SORT_DIRECTIONS,
  LEDGER_VIEWS,
  NOTES_MAX_LENGTH,
  REASON_MAX_LENGTH,
  REASON_MIN_LENGTH,
  SICKNESS_ADVANCE_REPORT_MAX_DAYS,
  defaultLedgerSortForView,
  isLedgerSortAllowed,
  ledgerFilterApplies,
  ledgerShowsEventFilters,
  type LedgerSortDirection,
  type LedgerSortField,
  type LedgerView,
} from "@/lib/absence/catalog";
import { DATE_RECORDED_BEFORE_EVENT_MESSAGE } from "@/lib/absence/eligibility";
import {
  SICKNESS_ADVANCE_BEYOND_LIMIT_MESSAGE,
  SICKNESS_ADVANCE_UNCONFIRMED_MESSAGE,
  SICKNESS_EVENT_FORBIDDEN_MESSAGE,
  SICKNESS_OUT_OF_SCOPE_FIELDS_MESSAGE,
  SICKNESS_REPORTED_FUTURE_MESSAGE,
  SICKNESS_STARTED_AFTER_FIRST_DAY_MESSAGE,
  SICKNESS_STARTED_FUTURE_MESSAGE,
  calendarDaysBetween,
  forbiddenSicknessFieldMessage,
  requiresAdvanceConfirmation,
  requiresCorrectionAdvanceConfirmation,
  sicknessHasForbiddenFields,
  unicodeCodePointLength,
} from "@/lib/absence/sickness";
import { parseLocalDate, parseLocalTime } from "@/lib/events/dates";
import { emptyToNull } from "@/lib/staff/normalize";

const localDateSchema = z
  .string()
  .trim()
  .min(1, "Reported date is required")
  .refine((value) => parseLocalDate(value) !== null, "Enter a valid date");

const dateRecordedSchema = z
  .string()
  .trim()
  .min(1, "Date recorded is required")
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

const awolFields = {
  type: z.literal("AWOL", {
    error: "Only AWOL can be logged with this form",
  }),
  staffId: z.string().trim().min(1, "Select a staff member"),
  eventId: z.string().trim().min(1, "Select an event"),
  reportedDate: dateRecordedSchema,
  notes: optionalNotesSchema,
  sameDayStartUnknownConfirmed: z.boolean(),
  eventDate: z.string().optional(),
  eventStartTime: z.string().optional(),
};

function refineAwolDates(
  value: {
    reportedDate: string;
    eventDate?: string;
  },
  ctx: z.RefinementCtx,
) {
  const eventDate = coerceLocalDateIso(value.eventDate?.trim() ?? "");
  if (!eventDate) {
    return;
  }
  if (value.reportedDate < eventDate) {
    ctx.addIssue({
      code: "custom",
      path: ["reportedDate"],
      message: DATE_RECORDED_BEFORE_EVENT_MESSAGE,
    });
  }
}

export const awolInputSchema = z
  .object({
    ...awolFields,
    idempotencyKey: idempotencyKeySchema,
  })
  .superRefine(refineAwolDates);

export const correctAwolInputSchema = z
  .object({
    ...awolFields,
    correctionReason: actionReasonSchema(
      "Correction reason",
      CORRECTION_REASON_MIN_LENGTH,
      CORRECTION_REASON_MAX_LENGTH,
    ),
    expectedUpdatedAt: expectedUpdatedAtSchema,
  })
  .superRefine(refineAwolDates);

export const archiveAwolInputSchema = z.object({
  archiveReason: actionReasonSchema(
    "Archive reason",
    ARCHIVE_REASON_MIN_LENGTH,
    ARCHIVE_REASON_MAX_LENGTH,
  ),
  confirmArchive: z.literal(true, {
    error: "Confirm that you want to archive this AWOL",
  }),
  expectedUpdatedAt: expectedUpdatedAtSchema,
});

export type AwolInput = Omit<
  z.infer<typeof awolInputSchema>,
  "eventDate" | "eventStartTime"
>;

export type CorrectAwolInput = Omit<
  z.infer<typeof correctAwolInputSchema>,
  "eventDate" | "eventStartTime"
>;

export type ArchiveAwolInput = z.infer<typeof archiveAwolInputSchema>;

const reportedDateSicknessSchema = z
  .string()
  .trim()
  .min(1, "Date sickness reported is required")
  .refine((value) => parseLocalDate(value) !== null, "Enter a valid date");

const firstWorkingDaySickSchema = z
  .string()
  .trim()
  .min(1, "First day sick from work is required")
  .refine((value) => parseLocalDate(value) !== null, "Enter a valid date");

const optionalSicknessStartedSchema = z
  .string()
  .trim()
  .transform((value) => value || null)
  .refine(
    (value) => value === null || parseLocalDate(value) !== null,
    "Enter a valid date",
  );

const issueSummarySchema = z
  .string()
  .transform((value) => emptyToNull(value))
  .refine(
    (value) =>
      value === null ||
      unicodeCodePointLength(value) <= ISSUE_SUMMARY_MAX_CODE_POINTS,
    `Issue summary must be ${ISSUE_SUMMARY_MAX_CODE_POINTS.toLocaleString()} characters or fewer`,
  );

const sicknessFields = {
  type: z.literal("SICKNESS", {
    error: "Only Sickness can be logged with this form",
  }),
  staffId: z.string().trim().min(1, "Select a staff member"),
  reportedDate: reportedDateSicknessSchema,
  firstWorkingDaySick: firstWorkingDaySickSchema,
  sicknessStartedDate: optionalSicknessStartedSchema,
  issueSummary: issueSummarySchema,
  futureFirstWorkingDayConfirmed: z.boolean(),
  todayIso: z.string().optional(),
  previousFirstWorkingDaySick: z.string().optional(),
};

function refineSicknessDates(
  value: {
    reportedDate: string;
    firstWorkingDaySick: string;
    sicknessStartedDate: string | null;
    futureFirstWorkingDayConfirmed: boolean;
    todayIso?: string;
    previousFirstWorkingDaySick?: string;
  },
  ctx: z.RefinementCtx,
  mode: "create" | "correct",
) {
  if (
    value.sicknessStartedDate &&
    value.sicknessStartedDate > value.firstWorkingDaySick
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["sicknessStartedDate"],
      message: SICKNESS_STARTED_AFTER_FIRST_DAY_MESSAGE,
    });
  }

  const advanceDays = calendarDaysBetween(
    value.reportedDate,
    value.firstWorkingDaySick,
  );
  if (advanceDays != null && advanceDays > SICKNESS_ADVANCE_REPORT_MAX_DAYS) {
    ctx.addIssue({
      code: "custom",
      path: ["firstWorkingDaySick"],
      message: SICKNESS_ADVANCE_BEYOND_LIMIT_MESSAGE,
    });
  }

  const todayIso = value.todayIso?.trim();
  if (!todayIso || !parseLocalDate(todayIso)) {
    return;
  }
  if (value.reportedDate > todayIso) {
    ctx.addIssue({
      code: "custom",
      path: ["reportedDate"],
      message: SICKNESS_REPORTED_FUTURE_MESSAGE,
    });
  }
  if (value.sicknessStartedDate && value.sicknessStartedDate > todayIso) {
    ctx.addIssue({
      code: "custom",
      path: ["sicknessStartedDate"],
      message: SICKNESS_STARTED_FUTURE_MESSAGE,
    });
  }

  const needsCreateConfirmation = requiresAdvanceConfirmation(
    value.firstWorkingDaySick,
    todayIso,
  );
  if (
    mode === "create" &&
    needsCreateConfirmation &&
    !value.futureFirstWorkingDayConfirmed
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["futureFirstWorkingDayConfirmed"],
      message: SICKNESS_ADVANCE_UNCONFIRMED_MESSAGE,
    });
  }
  if (
    mode === "correct" &&
    value.previousFirstWorkingDaySick &&
    requiresCorrectionAdvanceConfirmation({
      previousFirstWorkingDaySickIso: value.previousFirstWorkingDaySick,
      nextFirstWorkingDaySickIso: value.firstWorkingDaySick,
      todayIso,
    }) &&
    !value.futureFirstWorkingDayConfirmed
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["futureFirstWorkingDayConfirmed"],
      message: SICKNESS_ADVANCE_UNCONFIRMED_MESSAGE,
    });
  }
}

export const sicknessInputSchema = z
  .object({
    ...sicknessFields,
    idempotencyKey: idempotencyKeySchema,
  })
  .superRefine((value, ctx) => refineSicknessDates(value, ctx, "create"));

export const correctSicknessInputSchema = z
  .object({
    ...sicknessFields,
    correctionReason: actionReasonSchema(
      "Correction reason",
      CORRECTION_REASON_MIN_LENGTH,
      CORRECTION_REASON_MAX_LENGTH,
    ),
    expectedUpdatedAt: expectedUpdatedAtSchema,
  })
  .superRefine((value, ctx) => refineSicknessDates(value, ctx, "correct"));

export const archiveSicknessInputSchema = z.object({
  archiveReason: actionReasonSchema(
    "Archive reason",
    ARCHIVE_REASON_MIN_LENGTH,
    ARCHIVE_REASON_MAX_LENGTH,
  ),
  confirmArchive: z.literal(true, {
    error: "Confirm that you want to archive this sickness report",
  }),
  expectedUpdatedAt: expectedUpdatedAtSchema,
});

export type SicknessInput = Omit<
  z.infer<typeof sicknessInputSchema>,
  "todayIso" | "previousFirstWorkingDaySick"
>;

export type CorrectSicknessInput = Omit<
  z.infer<typeof correctSicknessInputSchema>,
  "todayIso" | "previousFirstWorkingDaySick"
>;

export type ArchiveSicknessInput = z.infer<typeof archiveSicknessInputSchema>;

function sicknessFormObject(formData: FormData) {
  return {
    type: formData.get("type") ?? "SICKNESS",
    staffId: formData.get("staffId") ?? "",
    reportedDate: formData.get("reportedDate") ?? "",
    firstWorkingDaySick: formData.get("firstWorkingDaySick") ?? "",
    sicknessStartedDate: formData.get("sicknessStartedDate") ?? "",
    issueSummary: formData.get("issueSummary") ?? "",
    futureFirstWorkingDayConfirmed:
      formData.get("futureFirstWorkingDayConfirmed") === "on",
    todayIso: String(formData.get("todayIso") ?? ""),
    previousFirstWorkingDaySick: String(
      formData.get("previousFirstWorkingDaySick") ?? "",
    ),
  };
}

function rejectForbiddenSicknessFields(
  formData: FormData,
): { success: false; error: z.ZodError } | null {
  if (!sicknessHasForbiddenFields(formData)) {
    return null;
  }
  const message = forbiddenSicknessFieldMessage(formData);
  const parsed =
    message === SICKNESS_EVENT_FORBIDDEN_MESSAGE
      ? z
          .object({
            eventId: z.string().max(0, SICKNESS_EVENT_FORBIDDEN_MESSAGE),
          })
          .safeParse({ eventId: String(formData.get("eventId") ?? "event") })
      : z
          .object({
            form: z.string().max(0, SICKNESS_OUT_OF_SCOPE_FIELDS_MESSAGE),
          })
          .safeParse({ form: message });
  if (parsed.success) {
    return z.object({ form: z.literal("ok") }).safeParse({
      form: "fail",
    }) as { success: false; error: z.ZodError };
  }
  return parsed;
}

export function parseSicknessFormData(formData: FormData) {
  const forbidden = rejectForbiddenSicknessFields(formData);
  if (forbidden) {
    return forbidden;
  }
  return sicknessInputSchema.safeParse({
    ...sicknessFormObject(formData),
    idempotencyKey: formData.get("idempotencyKey") ?? "",
  });
}

export function parseCorrectSicknessFormData(formData: FormData) {
  const forbidden = rejectForbiddenSicknessFields(formData);
  if (forbidden) {
    return forbidden;
  }
  return correctSicknessInputSchema.safeParse({
    ...sicknessFormObject(formData),
    correctionReason: formData.get("correctionReason") ?? "",
    expectedUpdatedAt: formData.get("expectedUpdatedAt") ?? "",
  });
}

export function parseArchiveSicknessFormData(formData: FormData) {
  return archiveSicknessInputSchema.safeParse({
    archiveReason: formData.get("archiveReason") ?? "",
    confirmArchive: formData.get("confirmArchive") === "on",
    expectedUpdatedAt: formData.get("expectedUpdatedAt") ?? "",
  });
}

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

function awolFormObject(formData: FormData) {
  return {
    type: formData.get("type") ?? "AWOL",
    staffId: formData.get("staffId") ?? "",
    eventId: formData.get("eventId") ?? "",
    reportedDate: formData.get("reportedDate") ?? "",
    notes: formData.get("notes") ?? "",
    sameDayStartUnknownConfirmed:
      formData.get("sameDayStartUnknownConfirmed") === "on",
    eventDate: String(formData.get("eventDate") ?? ""),
    eventStartTime: String(formData.get("eventStartTime") ?? ""),
  };
}

export function parseAwolFormData(formData: FormData) {
  return awolInputSchema.safeParse({
    ...awolFormObject(formData),
    idempotencyKey: formData.get("idempotencyKey") ?? "",
  });
}

export function parseCorrectAwolFormData(formData: FormData) {
  return correctAwolInputSchema.safeParse({
    ...awolFormObject(formData),
    correctionReason: formData.get("correctionReason") ?? "",
    expectedUpdatedAt: formData.get("expectedUpdatedAt") ?? "",
  });
}

export function parseArchiveAwolFormData(formData: FormData) {
  return archiveAwolInputSchema.safeParse({
    archiveReason: formData.get("archiveReason") ?? "",
    confirmArchive: formData.get("confirmArchive") === "on",
    expectedUpdatedAt: formData.get("expectedUpdatedAt") ?? "",
  });
}

export { flattenFieldErrors } from "@/lib/form";

const LEDGER_SORT_DIRECTION_SET = new Set<string>(LEDGER_SORT_DIRECTIONS);
const LEDGER_VIEW_SET = new Set<string>(LEDGER_VIEWS);

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

function optionalLedgerView(value: unknown): LedgerView {
  if (typeof value === "string" && LEDGER_VIEW_SET.has(value.trim())) {
    return value.trim() as LedgerView;
  }
  return DEFAULT_LEDGER_VIEW;
}

function optionalLedgerSort(
  value: unknown,
  view: LedgerView,
): LedgerSortField {
  const fallback = defaultLedgerSortForView(view);
  if (typeof value === "string" && isLedgerSortAllowed(view, value)) {
    return value;
  }
  return fallback;
}

function optionalLedgerIncludeArchived(value: unknown): boolean {
  return value === "1" || value === 1 || value === true;
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

function optionalLedgerDetail(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(trimmed)) {
    return "";
  }
  return trimmed;
}

export const ledgerListQuerySchema = z.object({
  q: z.string().max(160),
  venue: z.string(),
  eventType: z.string(),
  reportedFrom: z.string(),
  reportedTo: z.string(),
  affectedFrom: z.string(),
  affectedTo: z.string(),
  eventFrom: z.string(),
  eventTo: z.string(),
  firstDayFrom: z.string(),
  firstDayTo: z.string(),
  includeArchived: z.boolean(),
  sort: z.enum(ALL_LEDGER_SORT_FIELDS),
  direction: z.enum(LEDGER_SORT_DIRECTIONS),
  page: z.number().int().min(1),
  view: z.enum(LEDGER_VIEWS),
  detail: z.string(),
});

export type LedgerListQuery = z.infer<typeof ledgerListQuerySchema>;

export const defaultLedgerListQuery = (
  view: LedgerView = DEFAULT_LEDGER_VIEW,
): LedgerListQuery => ({
  q: "",
  venue: "",
  eventType: "",
  reportedFrom: "",
  reportedTo: "",
  affectedFrom: "",
  affectedTo: "",
  eventFrom: "",
  eventTo: "",
  firstDayFrom: "",
  firstDayTo: "",
  includeArchived: false,
  sort: defaultLedgerSortForView(view),
  direction: DEFAULT_LEDGER_DIRECTION,
  page: 1,
  view,
  detail: "",
});

export function parseLedgerListQuery(raw: {
  q?: string;
  venue?: string;
  eventType?: string;
  reportedFrom?: string;
  reportedTo?: string;
  affectedFrom?: string;
  affectedTo?: string;
  eventFrom?: string;
  eventTo?: string;
  firstDayFrom?: string;
  firstDayTo?: string;
  includeArchived?: string;
  sort?: string;
  direction?: string;
  page?: string;
  view?: string;
  detail?: string;
}): LedgerListQuery {
  const view = optionalLedgerView(raw.view);
  const eventFiltersApply = ledgerShowsEventFilters(view);
  const eventFrom = optionalLedgerDate(raw.eventFrom);
  const eventTo = optionalLedgerDate(raw.eventTo);
  const firstDayFrom = optionalLedgerDate(raw.firstDayFrom);
  const firstDayTo = optionalLedgerDate(raw.firstDayTo);
  const parsed = ledgerListQuerySchema.safeParse({
    q: typeof raw.q === "string" ? raw.q.trim().slice(0, 160) : "",
    venue:
      eventFiltersApply && typeof raw.venue === "string" ? raw.venue.trim() : "",
    eventType:
      eventFiltersApply && typeof raw.eventType === "string"
        ? raw.eventType.trim()
        : "",
    reportedFrom: optionalLedgerDate(raw.reportedFrom),
    reportedTo: optionalLedgerDate(raw.reportedTo),
    affectedFrom:
      optionalLedgerDate(raw.affectedFrom) || eventFrom || firstDayFrom,
    affectedTo: optionalLedgerDate(raw.affectedTo) || eventTo || firstDayTo,
    eventFrom,
    eventTo,
    firstDayFrom,
    firstDayTo,
    includeArchived: optionalLedgerIncludeArchived(raw.includeArchived),
    sort: optionalLedgerSort(raw.sort, view),
    direction: optionalLedgerDirection(raw.direction),
    page: optionalLedgerPage(raw.page),
    view,
    detail: optionalLedgerDetail(raw.detail),
  });
  return parsed.success ? parsed.data : defaultLedgerListQuery(view);
}

export function isLedgerDateRangeInvalid(query: LedgerListQuery): boolean {
  return Boolean(
    query.reportedFrom &&
      query.reportedTo &&
      query.reportedFrom > query.reportedTo,
  );
}

export function resolvedLedgerAffectedFrom(query: LedgerListQuery): string {
  return query.affectedFrom || query.eventFrom || query.firstDayFrom;
}

export function resolvedLedgerAffectedTo(query: LedgerListQuery): string {
  return query.affectedTo || query.eventTo || query.firstDayTo;
}

export function isLedgerAffectedDateRangeInvalid(
  query: LedgerListQuery,
): boolean {
  const from = resolvedLedgerAffectedFrom(query);
  const to = resolvedLedgerAffectedTo(query);
  return Boolean(from && to && from > to);
}

export function isLedgerEventDateRangeInvalid(query: LedgerListQuery): boolean {
  return Boolean(
    query.eventFrom && query.eventTo && query.eventFrom > query.eventTo,
  );
}

export function isLedgerFirstDayRangeInvalid(query: LedgerListQuery): boolean {
  return Boolean(
    query.firstDayFrom &&
      query.firstDayTo &&
      query.firstDayFrom > query.firstDayTo,
  );
}

export function ledgerHasActiveFilters(query: LedgerListQuery): boolean {
  const affectedFrom = resolvedLedgerAffectedFrom(query);
  const affectedTo = resolvedLedgerAffectedTo(query);
  return Boolean(
    query.q ||
      (ledgerFilterApplies(query.view, "venue") && query.venue) ||
      (ledgerFilterApplies(query.view, "eventType") && query.eventType) ||
      query.includeArchived ||
      (!isLedgerDateRangeInvalid(query) &&
        (query.reportedFrom || query.reportedTo)) ||
      (!isLedgerAffectedDateRangeInvalid(query) &&
        (affectedFrom || affectedTo)),
  );
}

export function ledgerRawHasIncompatibleEventFilters(raw: {
  view?: string;
  venue?: string;
  eventType?: string;
}): boolean {
  const view = optionalLedgerView(raw.view);
  if (ledgerShowsEventFilters(view)) {
    return false;
  }
  const venue = typeof raw.venue === "string" ? raw.venue.trim() : "";
  const eventType =
    typeof raw.eventType === "string" ? raw.eventType.trim() : "";
  return Boolean(venue || eventType);
}
