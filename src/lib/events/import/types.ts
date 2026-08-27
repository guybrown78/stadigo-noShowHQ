import type { EventStatusValue } from "@/lib/events/catalog";
import type { EventImportHeader } from "@/lib/events/import/constants";

export type ImportRowRaw = Record<EventImportHeader, string>;

export type ImportRowNormalized = {
  reference: string | null;
  name: string;
  eventTypeLabel: string;
  eventSubtypeLabel: string;
  venueName: string;
  venueAddressLine1: string | null;
  venueTownCity: string | null;
  venuePostcode: string | null;
  eventDate: string;
  briefingTime: string | null;
  startTime: string | null;
  endTime: string | null;
  overnight: boolean;
  staffRequired: number;
  warningFillRate: number;
  criticalFillRate: number;
  status: EventStatusValue;
  notes: string | null;
};

export type ParsedImportRow = {
  sourceRowNumber: number;
  raw: ImportRowRaw;
  empty: boolean;
};

export type FieldErrors = Record<string, string[]>;

export type ValidatedImportRow = {
  sourceRowNumber: number;
  raw: ImportRowRaw;
  status: "VALID" | "INVALID" | "IGNORED";
  fieldErrors: FieldErrors;
  normalized: ImportRowNormalized | null;
  eventTypeId: string | null;
  eventSubtypeId: string | null;
  venueKey: string | null;
};

export type ResolvedImportVenue = {
  nameNormalized: string;
  importedName: string;
  addressLine1: string | null;
  townCity: string | null;
  postcode: string | null;
  outcome: "MATCHED" | "NEW" | "AMBIGUOUS";
  matchedVenueId: string | null;
  inactiveMatch: boolean;
  eventRowCount: number;
  storedName: string | null;
  storedAddressLine1: string | null;
  storedTownCity: string | null;
  storedPostcode: string | null;
};
