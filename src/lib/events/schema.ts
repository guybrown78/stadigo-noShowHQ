import { z } from "zod";
import {
  DEFAULT_CRITICAL_FILL_RATE,
  DEFAULT_WARNING_FILL_RATE,
  EVENT_STATUSES,
} from "@/lib/events/catalog";
import { isTimeBefore, parseLocalDate, parseLocalTime } from "@/lib/events/dates";
import { emptyToNull, normalizeUkPostcode, normalizeVenueName } from "@/lib/events/normalize";

function optionalString(max: number, message: string) {
  return z
    .string()
    .transform((value) => emptyToNull(value))
    .refine((value) => value === null || value.length <= max, message);
}

const localDateSchema = z
  .string()
  .trim()
  .min(1, "Event date is required")
  .refine((value) => parseLocalDate(value) !== null, "Enter a valid event date");

const localTimeSchema = z
  .string()
  .refine((value) => {
    const trimmed = value.trim();
    return !trimmed || parseLocalTime(trimmed) !== null;
  }, "Enter a valid time")
  .transform((value) => parseLocalTime(value.trim()));

export const eventInputSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Event name must be at least 2 characters")
      .max(160, "Event name must be 160 characters or fewer"),
    reference: optionalString(80, "Reference must be 80 characters or fewer"),
    eventTypeId: z.string().trim().min(1, "Select an event type"),
    eventSubtypeId: z.string().trim().min(1, "Select an event subtype"),
    venueId: z.string().transform((value) => emptyToNull(value)),
    newVenueName: z.string().transform((value) => {
      const name = normalizeVenueName(value);
      return name.length === 0 ? null : name;
    }),
    newVenueAddressLine1: optionalString(
      160,
      "Address must be 160 characters or fewer",
    ),
    newVenueTownCity: optionalString(
      120,
      "Town or city must be 120 characters or fewer",
    ),
    newVenuePostcode: z.string().transform((value) => {
      const raw = emptyToNull(value);
      return raw ? normalizeUkPostcode(raw) : null;
    }),
    eventDate: localDateSchema,
    briefingTime: localTimeSchema,
    startTime: localTimeSchema,
    endTime: localTimeSchema,
    endsNextDay: z.boolean().optional().default(false),
    staffRequired: z.coerce
      .number()
      .int("Staff required must be a whole number")
      .min(1, "Staff required must be at least 1")
      .max(100000, "Staff required must be 100,000 or fewer"),
    warningFillRate: z.coerce
      .number()
      .int("Warning fill rate must be a whole number")
      .min(1, "Warning fill rate must be between 1 and 100")
      .max(100, "Warning fill rate must be between 1 and 100"),
    criticalFillRate: z.coerce
      .number()
      .int("Critical fill rate must be a whole number")
      .min(1, "Critical fill rate must be between 1 and 100")
      .max(100, "Critical fill rate must be between 1 and 100"),
    status: z.enum(EVENT_STATUSES),
    notes: optionalString(2000, "Notes must be 2,000 characters or fewer"),
  })
  .superRefine((data, ctx) => {
    if (!data.venueId && !data.newVenueName) {
      ctx.addIssue({
        code: "custom",
        path: ["venueId"],
        message: "Select a venue or add a new one",
      });
    }

    if (data.newVenueName && data.newVenueName.length < 2) {
      ctx.addIssue({
        code: "custom",
        path: ["newVenueName"],
        message: "Venue name must be at least 2 characters",
      });
    }

    if (data.newVenueName && data.newVenueName.length > 160) {
      ctx.addIssue({
        code: "custom",
        path: ["newVenueName"],
        message: "Venue name must be 160 characters or fewer",
      });
    }

    if (data.criticalFillRate >= data.warningFillRate) {
      ctx.addIssue({
        code: "custom",
        path: ["criticalFillRate"],
        message: "Critical fill rate must be lower than the warning fill rate",
      });
    }

    if (
      data.briefingTime &&
      data.startTime &&
      !isTimeBefore(data.briefingTime, data.startTime)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["briefingTime"],
        message: "Briefing time must be earlier than start time",
      });
    }

    if (data.startTime && data.endTime) {
      if (data.startTime === data.endTime) {
        ctx.addIssue({
          code: "custom",
          path: ["endTime"],
          message: "End time must be later than start time",
        });
      } else if (
        !data.endsNextDay &&
        !isTimeBefore(data.startTime, data.endTime)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["endTime"],
          message:
            "End time must be later than start time. For overnight events, tick “Ends the next day”.",
        });
      }
    }
  });

export type EventInput = z.infer<typeof eventInputSchema>;

export const venueInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Venue name must be at least 2 characters")
    .max(160, "Venue name must be 160 characters or fewer")
    .transform((value) => normalizeVenueName(value)),
  addressLine1: optionalString(
    160,
    "Address must be 160 characters or fewer",
  ),
  townCity: optionalString(
    120,
    "Town or city must be 120 characters or fewer",
  ),
  postcode: z.string().transform((value) => {
    const raw = emptyToNull(value);
    return raw ? normalizeUkPostcode(raw) : null;
  }),
  active: z.boolean().optional().default(true),
});

export type VenueInput = z.infer<typeof venueInputSchema>;

export const venueListQuerySchema = z.object({
  q: z.string().trim().max(160).optional().default(""),
  status: z.enum(["", "active", "inactive"]).optional().default(""),
  page: z.coerce.number().int().min(1).optional().default(1),
});

export type VenueListQuery = z.infer<typeof venueListQuerySchema>;

export function parseVenueFormData(formData: FormData) {
  return venueInputSchema.safeParse({
    name: formData.get("name") ?? "",
    addressLine1: formData.get("addressLine1") ?? "",
    townCity: formData.get("townCity") ?? "",
    postcode: formData.get("postcode") ?? "",
    active: formData.get("active") === "on",
  });
}

export const eventListQuerySchema = z.object({
  q: z.string().trim().max(160).optional().default(""),
  status: z
    .enum(["", ...EVENT_STATUSES])
    .optional()
    .default(""),
  type: z.string().trim().optional().default(""),
  range: z.enum(["all", "upcoming", "past"]).optional().default("all"),
  from: z.string().trim().optional().default(""),
  to: z.string().trim().optional().default(""),
  page: z.coerce.number().int().min(1).optional().default(1),
});

export type EventListQuery = z.infer<typeof eventListQuerySchema>;

export function parseEventFormData(formData: FormData) {
  return eventInputSchema.safeParse({
    name: formData.get("name") ?? "",
    reference: formData.get("reference") ?? "",
    eventTypeId: formData.get("eventTypeId") ?? "",
    eventSubtypeId: formData.get("eventSubtypeId") ?? "",
    venueId: formData.get("venueId") ?? "",
    newVenueName: formData.get("newVenueName") ?? "",
    newVenueAddressLine1: formData.get("newVenueAddressLine1") ?? "",
    newVenueTownCity: formData.get("newVenueTownCity") ?? "",
    newVenuePostcode: formData.get("newVenuePostcode") ?? "",
    eventDate: formData.get("eventDate") ?? "",
    briefingTime: formData.get("briefingTime") ?? "",
    startTime: formData.get("startTime") ?? "",
    endTime: formData.get("endTime") ?? "",
    endsNextDay: formData.get("endsNextDay") === "on",
    staffRequired: formData.get("staffRequired") ?? "",
    warningFillRate:
      formData.get("warningFillRate") || DEFAULT_WARNING_FILL_RATE,
    criticalFillRate:
      formData.get("criticalFillRate") || DEFAULT_CRITICAL_FILL_RATE,
    status: formData.get("status") ?? "PLANNED",
    notes: formData.get("notes") ?? "",
  });
}

export { flattenFieldErrors } from "@/lib/form";
