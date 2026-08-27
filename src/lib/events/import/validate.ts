import {
  DEFAULT_CRITICAL_FILL_RATE,
  DEFAULT_WARNING_FILL_RATE,
  EVENT_STATUSES,
  type EventStatusValue,
} from "@/lib/events/catalog";
import { flattenFieldErrors, eventInputSchema } from "@/lib/events/schema";
import {
  emptyToNull,
  normalizeUkPostcode,
  normalizeVenueName,
  normalizeVenueNameKey,
} from "@/lib/events/normalize";
import type {
  FieldErrors,
  ImportRowNormalized,
  ParsedImportRow,
  ResolvedImportVenue,
  ValidatedImportRow,
} from "@/lib/events/import/types";

export type TaxonomyOption = {
  id: string;
  name: string;
  code: string;
  subtypes: { id: string; name: string; code: string }[];
};

export type ExistingEventForImport = {
  id: string;
  name: string;
  reference: string | null;
  eventDate: Date;
  venueId: string;
  venueNameNormalized: string;
};

export type ExistingVenueForImport = {
  id: string;
  name: string;
  nameNormalized: string;
  addressLine1: string | null;
  townCity: string | null;
  postcode: string | null;
  active: boolean;
};

export type ImportValidationResult = {
  rows: ValidatedImportRow[];
  venues: ResolvedImportVenue[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
  ignoredRows: number;
  matchedVenueCount: number;
  newVenueCount: number;
  duplicateEventCount: number;
  hasBlockingErrors: boolean;
};

const IMPORT_FIELD_LABEL: Record<string, string> = {
  reference: "Reference",
  name: "Event Name",
  eventTypeId: "Event Type",
  eventSubtypeId: "Event Subtype",
  venueId: "Venue Name",
  newVenueName: "Venue Name",
  newVenueAddressLine1: "Venue Address Line 1",
  newVenueTownCity: "Venue Town/City",
  newVenuePostcode: "Venue Postcode",
  eventDate: "Event Date",
  briefingTime: "Briefing Time",
  startTime: "Start Time",
  endTime: "End Time",
  endsNextDay: "Overnight",
  staffRequired: "Staff Required",
  warningFillRate: "Warning Fill Rate %",
  criticalFillRate: "Critical Fill Rate %",
  status: "Status",
  notes: "Notes",
};

export function importFieldLabel(field: string): string {
  return IMPORT_FIELD_LABEL[field] ?? field;
}

export function validateImportRows(
  parsed: ParsedImportRow[],
  params: {
    types: TaxonomyOption[];
    existingEvents: ExistingEventForImport[];
    existingVenues: ExistingVenueForImport[];
  },
): ImportValidationResult {
  const typeIndex = buildTypeIndex(params.types);
  const existingRefs = new Map<string, ExistingEventForImport>();
  for (const event of params.existingEvents) {
    if (event.reference) {
      existingRefs.set(event.reference.toLowerCase(), event);
    }
  }
  const existingDupKeys = new Set(
    params.existingEvents.map((event) =>
      duplicateKey(
        event.name,
        event.venueNameNormalized,
        isoDate(event.eventDate),
      ),
    ),
  );
  const venuesByKey = new Map(
    params.existingVenues.map((venue) => [venue.nameNormalized, venue]),
  );

  const fileRefs = new Map<string, number[]>();
  const fileDupKeys = new Map<string, number[]>();

  const rows: ValidatedImportRow[] = parsed.map((row) => {
    if (row.empty) {
      return {
        sourceRowNumber: row.sourceRowNumber,
        raw: row.raw,
        status: "IGNORED",
        fieldErrors: {},
        normalized: null,
        eventTypeId: null,
        eventSubtypeId: null,
        venueKey: null,
      };
    }
    return validateOneRow(row, typeIndex);
  });

  for (const row of rows) {
    if (row.status !== "VALID" || !row.normalized) {
      continue;
    }
    if (row.normalized.reference) {
      const key = row.normalized.reference.toLowerCase();
      const list = fileRefs.get(key) ?? [];
      list.push(row.sourceRowNumber);
      fileRefs.set(key, list);
    }
    const key = duplicateKey(
      row.normalized.name,
      row.venueKey ?? "",
      row.normalized.eventDate,
    );
    const list = fileDupKeys.get(key) ?? [];
    list.push(row.sourceRowNumber);
    fileDupKeys.set(key, list);
  }

  for (const row of rows) {
    if (row.status !== "VALID" || !row.normalized) {
      continue;
    }
    if (row.normalized.reference) {
      const key = row.normalized.reference.toLowerCase();
      const inFile = fileRefs.get(key) ?? [];
      if (inFile.length > 1) {
        addError(
          row,
          "reference",
          "This reference is used more than once in the file. Each reference must be unique.",
        );
      }
      if (existingRefs.has(key)) {
        addError(
          row,
          "reference",
          "This reference already belongs to an active event. Import cannot update existing events.",
        );
      }
    } else {
      const key = duplicateKey(
        row.normalized.name,
        row.venueKey ?? "",
        row.normalized.eventDate,
      );
      const inFile = fileDupKeys.get(key) ?? [];
      if (inFile.length > 1) {
        addError(
          row,
          "name",
          "Another row in this file has the same event name, venue and date. Remove the duplicate or add a unique reference.",
        );
      }
      if (existingDupKeys.has(key)) {
        addError(
          row,
          "name",
          "An active event already exists with this name, venue and date. Import cannot update existing events. Change the row or add it by hand after checking it.",
        );
      }
    }
  }

  const venues = resolveVenues(rows, venuesByKey);
  for (const venue of venues) {
    if (venue.outcome !== "AMBIGUOUS") {
      continue;
    }
    for (const row of rows) {
      if (row.venueKey === venue.nameNormalized && row.status !== "IGNORED") {
        addError(
          row,
          "newVenueAddressLine1",
          "Venue details for this name do not match across the file. Use one address, town/city and postcode for each venue name.",
        );
      }
    }
  }

  const validRows = rows.filter((row) => row.status === "VALID").length;
  const invalidRows = rows.filter((row) => row.status === "INVALID").length;
  const ignoredRows = rows.filter((row) => row.status === "IGNORED").length;
  const duplicateEventCount = rows.filter(
    (row) =>
      row.status === "INVALID" &&
      (row.fieldErrors.reference || row.fieldErrors.name)?.some((message) =>
        /already|more than once|duplicate/i.test(message),
      ),
  ).length;

  return {
    rows,
    venues,
    totalRows: rows.length,
    validRows,
    invalidRows,
    ignoredRows,
    matchedVenueCount: venues.filter((venue) => venue.outcome === "MATCHED")
      .length,
    newVenueCount: venues.filter((venue) => venue.outcome === "NEW").length,
    duplicateEventCount,
    hasBlockingErrors:
      invalidRows > 0 || venues.some((venue) => venue.outcome === "AMBIGUOUS"),
  };
}

function validateOneRow(
  row: ParsedImportRow,
  typeIndex: TypeIndex,
): ValidatedImportRow {
  const fieldErrors: FieldErrors = {};
  const raw = row.raw;

  const overnight = parseOvernight(raw.Overnight);
  if (!overnight.ok) {
    pushError(
      fieldErrors,
      "endsNextDay",
      "Overnight must be Yes or No. Leave blank for No.",
    );
  }

  const taxonomy = resolveTaxonomy(
    raw["Event Type"],
    raw["Event Subtype"],
    typeIndex,
  );
  if (taxonomy.typeError) {
    pushError(fieldErrors, "eventTypeId", taxonomy.typeError);
  }
  if (taxonomy.subtypeError) {
    pushError(fieldErrors, "eventSubtypeId", taxonomy.subtypeError);
  }

  const venueName = normalizeVenueName(raw["Venue Name"]);
  const venueKey = venueName ? normalizeVenueNameKey(venueName) : null;

  const statusValue = parseStatus(raw.Status);
  if (!statusValue.ok) {
    pushError(
      fieldErrors,
      "status",
      "Status must be PLANNED, CONFIRMED, CANCELLED or COMPLETED. Leave blank for PLANNED.",
    );
  }

  const parsed = eventInputSchema.safeParse({
    name: raw["Event Name"],
    reference: raw.Reference,
    eventTypeId: taxonomy.typeId ?? "",
    eventSubtypeId: taxonomy.subtypeId ?? "",
    venueId: "",
    newVenueName: raw["Venue Name"],
    newVenueAddressLine1: raw["Venue Address Line 1"],
    newVenueTownCity: raw["Venue Town/City"],
    newVenuePostcode: raw["Venue Postcode"],
    eventDate: raw["Event Date"],
    briefingTime: raw["Briefing Time"],
    startTime: raw["Start Time"],
    endTime: raw["End Time"],
    endsNextDay: overnight.ok ? overnight.value : false,
    staffRequired: raw["Staff Required"],
    warningFillRate: raw["Warning Fill Rate %"] || DEFAULT_WARNING_FILL_RATE,
    criticalFillRate: raw["Critical Fill Rate %"] || DEFAULT_CRITICAL_FILL_RATE,
    status: statusValue.ok ? statusValue.value : "PLANNED",
    notes: raw.Notes,
  });

  if (!parsed.success) {
    const schemaErrors = flattenFieldErrors(parsed.error);
    for (const [field, messages] of Object.entries(schemaErrors)) {
      if (
        (field === "eventTypeId" && taxonomy.typeError) ||
        (field === "eventSubtypeId" && taxonomy.subtypeError)
      ) {
        continue;
      }
      for (const message of messages) {
        pushError(fieldErrors, field, rewriteSchemaMessage(field, message));
      }
    }
  }

  if (Object.keys(fieldErrors).length > 0 || !parsed.success) {
    return {
      sourceRowNumber: row.sourceRowNumber,
      raw,
      status: "INVALID",
      fieldErrors,
      normalized: parsed.success ? toNormalized(parsed.data, raw, overnight.ok ? overnight.value : false) : null,
      eventTypeId: taxonomy.typeId,
      eventSubtypeId: taxonomy.subtypeId,
      venueKey,
    };
  }

  return {
    sourceRowNumber: row.sourceRowNumber,
    raw,
    status: "VALID",
    fieldErrors: {},
    normalized: toNormalized(parsed.data, raw, parsed.data.endsNextDay),
    eventTypeId: taxonomy.typeId,
    eventSubtypeId: taxonomy.subtypeId,
    venueKey,
  };
}

function toNormalized(
  data: {
    reference: string | null;
    name: string;
    newVenueName: string | null;
    newVenueAddressLine1: string | null;
    newVenueTownCity: string | null;
    newVenuePostcode: string | null;
    eventDate: string;
    briefingTime: string | null;
    startTime: string | null;
    endTime: string | null;
    endsNextDay: boolean;
    staffRequired: number;
    warningFillRate: number;
    criticalFillRate: number;
    status: EventStatusValue;
    notes: string | null;
  },
  raw: ParsedImportRow["raw"],
  overnight: boolean,
): ImportRowNormalized {
  return {
    reference: data.reference,
    name: data.name,
    eventTypeLabel: raw["Event Type"].trim(),
    eventSubtypeLabel: raw["Event Subtype"].trim(),
    venueName: data.newVenueName ?? normalizeVenueName(raw["Venue Name"]),
    venueAddressLine1: data.newVenueAddressLine1,
    venueTownCity: data.newVenueTownCity,
    venuePostcode: data.newVenuePostcode,
    eventDate: data.eventDate,
    briefingTime: data.briefingTime,
    startTime: data.startTime,
    endTime: data.endTime,
    overnight,
    staffRequired: data.staffRequired,
    warningFillRate: data.warningFillRate,
    criticalFillRate: data.criticalFillRate,
    status: data.status,
    notes: data.notes,
  };
}

function resolveVenues(
  rows: ValidatedImportRow[],
  venuesByKey: Map<string, ExistingVenueForImport>,
): ResolvedImportVenue[] {
  const groups = new Map<
    string,
    {
      names: string[];
      addresses: (string | null)[];
      towns: (string | null)[];
      postcodes: (string | null)[];
      eventRowCount: number;
    }
  >();

  for (const row of rows) {
    if (row.status === "IGNORED" || !row.venueKey) {
      continue;
    }
    const group = groups.get(row.venueKey) ?? {
      names: [],
      addresses: [],
      towns: [],
      postcodes: [],
      eventRowCount: 0,
    };
    const name =
      row.normalized?.venueName ?? normalizeVenueName(row.raw["Venue Name"]);
    group.names.push(name);
    group.addresses.push(
      row.normalized?.venueAddressLine1 ??
        emptyToNull(row.raw["Venue Address Line 1"]),
    );
    group.towns.push(
      row.normalized?.venueTownCity ?? emptyToNull(row.raw["Venue Town/City"]),
    );
    const postcodeRaw =
      row.normalized?.venuePostcode ??
      (emptyToNull(row.raw["Venue Postcode"])
        ? normalizeUkPostcode(row.raw["Venue Postcode"])
        : null);
    group.postcodes.push(postcodeRaw);
    group.eventRowCount += 1;
    groups.set(row.venueKey, group);
  }

  const resolved: ResolvedImportVenue[] = [];
  for (const [nameNormalized, group] of groups) {
    const conflicting =
      hasConflict(group.addresses) ||
      hasConflict(group.towns) ||
      hasConflict(group.postcodes);
    const existing = venuesByKey.get(nameNormalized);
    const importedName = group.names.find((name) => name.length > 0) ?? nameNormalized;
    resolved.push({
      nameNormalized,
      importedName,
      addressLine1: firstNonEmpty(group.addresses),
      townCity: firstNonEmpty(group.towns),
      postcode: firstNonEmpty(group.postcodes),
      outcome: conflicting ? "AMBIGUOUS" : existing ? "MATCHED" : "NEW",
      matchedVenueId: conflicting ? null : existing?.id ?? null,
      inactiveMatch: Boolean(existing && !existing.active),
      eventRowCount: group.eventRowCount,
      storedName: existing?.name ?? null,
      storedAddressLine1: existing?.addressLine1 ?? null,
      storedTownCity: existing?.townCity ?? null,
      storedPostcode: existing?.postcode ?? null,
    });
  }
  return resolved.sort((a, b) => a.importedName.localeCompare(b.importedName));
}

function hasConflict(values: (string | null)[]): boolean {
  const unique = new Set(
    values
      .filter((value): value is string => Boolean(value))
      .map((value) => value.trim().toLowerCase()),
  );
  return unique.size > 1;
}

function firstNonEmpty(values: (string | null)[]): string | null {
  return values.find((value): value is string => Boolean(value)) ?? null;
}

type TypeIndex = {
  types: Map<string, TaxonomyOption>;
};

function buildTypeIndex(types: TaxonomyOption[]): TypeIndex {
  const map = new Map<string, TaxonomyOption>();
  for (const type of types) {
    map.set(type.name.trim().toLowerCase(), type);
    map.set(type.code.trim().toLowerCase(), type);
  }
  return { types: map };
}

function resolveTaxonomy(
  typeLabel: string,
  subtypeLabel: string,
  index: TypeIndex,
): {
  typeId: string | null;
  subtypeId: string | null;
  typeError: string | null;
  subtypeError: string | null;
} {
  const typeKey = typeLabel.trim().toLowerCase();
  const subtypeKey = subtypeLabel.trim().toLowerCase();
  if (!typeKey) {
    return {
      typeId: null,
      subtypeId: null,
      typeError: "Event type is required and must match an active type listed in the template.",
      subtypeError: subtypeKey
        ? "Choose a subtype that belongs to the event type."
        : "Event subtype is required.",
    };
  }
  const type = index.types.get(typeKey);
  if (!type) {
    return {
      typeId: null,
      subtypeId: null,
      typeError:
        "Event type must match an active type listed on the Reference Data sheet.",
      subtypeError: subtypeKey
        ? "Choose a subtype that belongs to a valid event type."
        : "Event subtype is required.",
    };
  }
  if (!subtypeKey) {
    return {
      typeId: type.id,
      subtypeId: null,
      typeError: null,
      subtypeError: "Event subtype is required and must belong to the event type.",
    };
  }
  const subtype = type.subtypes.find(
    (item) =>
      item.name.trim().toLowerCase() === subtypeKey ||
      item.code.trim().toLowerCase() === subtypeKey,
  );
  if (!subtype) {
    return {
      typeId: type.id,
      subtypeId: null,
      typeError: null,
      subtypeError:
        "Event subtype must match an active subtype of the selected event type.",
    };
  }
  return {
    typeId: type.id,
    subtypeId: subtype.id,
    typeError: null,
    subtypeError: null,
  };
}

function parseOvernight(
  value: string,
): { ok: true; value: boolean } | { ok: false } {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return { ok: true, value: false };
  }
  if (["yes", "y", "true", "1"].includes(trimmed)) {
    return { ok: true, value: true };
  }
  if (["no", "n", "false", "0"].includes(trimmed)) {
    return { ok: true, value: false };
  }
  return { ok: false };
}

function parseStatus(
  value: string,
): { ok: true; value: EventStatusValue } | { ok: false } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: true, value: "PLANNED" };
  }
  const match = EVENT_STATUSES.find(
    (status) => status.toLowerCase() === trimmed.toLowerCase(),
  );
  if (!match) {
    return { ok: false };
  }
  return { ok: true, value: match };
}

function rewriteSchemaMessage(field: string, message: string): string {
  if (field === "endTime" && message.includes("Ends the next day")) {
    return "End time must be later than start time. For overnight events, set Overnight to Yes.";
  }
  if (field === "eventDate") {
    return "Event date must be a valid calendar date in YYYY-MM-DD format.";
  }
  if (field === "eventTypeId") {
    return "Event type is required and must match an active type listed in the template.";
  }
  if (field === "eventSubtypeId") {
    return "Event subtype is required and must belong to the event type.";
  }
  if (field === "venueId" || field === "newVenueName") {
    return "Venue name is required.";
  }
  return message;
}

function pushError(target: FieldErrors, field: string, message: string) {
  const existing = target[field] ?? [];
  if (!existing.includes(message)) {
    existing.push(message);
  }
  target[field] = existing;
}

function addError(row: ValidatedImportRow, field: string, message: string) {
  pushError(row.fieldErrors, field, message);
  row.status = "INVALID";
}

function duplicateKey(name: string, venueKey: string, date: string): string {
  return `${normalizeVenueNameKey(name)}|${venueKey}|${date}`;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
