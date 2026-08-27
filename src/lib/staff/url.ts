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
  if (merged.clearanceStatus) {
    params.set("clearanceStatus", merged.clearanceStatus);
  }
  if (merged.page && merged.page > 1) params.set("page", String(merged.page));

  const qs = params.toString();
  return qs ? `/staff?${qs}` : "/staff";
}
