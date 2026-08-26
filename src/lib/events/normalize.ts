export function normalizeVenueName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function normalizeVenueNameKey(name: string): string {
  return normalizeVenueName(name).toLowerCase();
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
