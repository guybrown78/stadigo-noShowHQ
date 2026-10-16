export function normalizeVenueName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function normalizeVenueNameKey(name: string): string {
  return normalizeVenueName(name).toLowerCase();
}

/** System venue ID, unique inside one organisation: VEN-1, VEN-2, and so on. */
export function normalizeVenueIdentifier(value: string | null | undefined): string | null {
  const compact = value?.trim().toUpperCase().replace(/\s+/g, "") ?? "";
  return /^VEN-\d+$/.test(compact) ? compact : null;
}

/** Optional venue short code: uppercase letters, numbers, and hyphens. */
export function normalizeVenueCode(value: string | null | undefined): string | null {
  const compact = value?.trim().toUpperCase().replace(/\s+/g, "") ?? "";
  return compact.length > 0 ? compact : null;
}

/** Normalise a UK postcode to uppercase with a space before the inward code. */
export function normalizeUkPostcode(value: string): string | null {
  const compact = value.replace(/\s+/g, "").toUpperCase();
  if (!compact) {
    return null;
  }
  if (compact.length < 5 || compact.length > 7) {
    return compact;
  }
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
}

export function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
