import type { StaffListQuery } from "@/lib/staff/schema";

export function staffListHref(
  query: Partial<StaffListQuery>,
  overrides: Partial<StaffListQuery> = {},
): string {
  const merged = { ...query, ...overrides };
  const params = new URLSearchParams();

  if (merged.q) params.set("q", merged.q);
  if (merged.employmentStatus) {
    params.set("employmentStatus", merged.employmentStatus);
  }
  if (merged.department) params.set("department", merged.department);
  if (merged.probationStatus) {
    params.set("probationStatus", merged.probationStatus);
  }
  if (merged.probationLifecycle) {
    params.set("probationLifecycle", merged.probationLifecycle);
  }
  if (merged.clearanceStatus) {
    params.set("clearanceStatus", merged.clearanceStatus);
  }
  if (merged.page && merged.page > 1) params.set("page", String(merged.page));

  const qs = params.toString();
  return qs ? `/staff?${qs}` : "/staff";
}

export function importErrorsHref(
  importId: string,
  query: { q?: string; page?: number } = {},
): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.page && query.page > 1) params.set("page", String(query.page));
  const qs = params.toString();
  return qs
    ? `/staff/import/${importId}/errors?${qs}`
    : `/staff/import/${importId}/errors`;
}

export function importConfirmHref(
  importId: string,
  query: { page?: number } = {},
): string {
  const params = new URLSearchParams();
  if (query.page && query.page > 1) params.set("page", String(query.page));
  const qs = params.toString();
  return qs
    ? `/staff/import/${importId}/confirm?${qs}`
    : `/staff/import/${importId}/confirm`;
}

export function importCompleteHref(
  importId: string,
  query: { page?: number } = {},
): string {
  const params = new URLSearchParams();
  if (query.page && query.page > 1) params.set("page", String(query.page));
  const qs = params.toString();
  return qs
    ? `/staff/import/${importId}/complete?${qs}`
    : `/staff/import/${importId}/complete`;
}
