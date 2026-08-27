export function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function normalizeStaffIdNumber(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeStaffIdKey(value: string): string {
  return normalizeStaffIdNumber(value).toLowerCase();
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizePersonName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}
