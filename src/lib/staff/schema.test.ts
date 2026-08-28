import { describe, expect, it } from "vitest";
import { parseStaffFormData, staffInputSchema } from "@/lib/staff/schema";

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    staffIdNumber: "ST-1001",
    firstName: "Alex",
    lastName: "Patel",
    email: "",
    phone: "",
    department: "",
    roleTitle: "Steward",
    managerStaffId: "",
    employmentStatus: "ACTIVE",
    startDate: "",
    applyProbation: false,
    probationLengthDays: "",
    overrideProbationEndDate: false,
    probationEndDate: "",
    probationStatus: "NOT_APPLICABLE",
    securityClearanceStatus: "NOT_RECORDED",
    securityClearanceExpiryDate: "",
    notes: "",
    ...overrides,
  };
}

describe("staffInputSchema", () => {
  it("accepts a minimal valid staff record", () => {
    const parsed = staffInputSchema.safeParse(validInput());
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.staffIdNumber).toBe("ST-1001");
      expect(parsed.data.email).toBeNull();
      expect(parsed.data.employmentStatus).toBe("ACTIVE");
    }
  });

  it("trims names and staff ID", () => {
    const parsed = staffInputSchema.safeParse(
      validInput({
        staffIdNumber: "  ST-9  ",
        firstName: "  Alex  ",
        lastName: "  Patel  ",
      }),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.staffIdNumber).toBe("ST-9");
      expect(parsed.data.firstName).toBe("Alex");
      expect(parsed.data.lastName).toBe("Patel");
    }
  });

  it("rejects missing staff ID, first name, last name, and role", () => {
    for (const field of [
      "staffIdNumber",
      "firstName",
      "lastName",
      "roleTitle",
    ] as const) {
      const parsed = staffInputSchema.safeParse(validInput({ [field]: "  " }));
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        const paths = parsed.error.issues.map((issue) => issue.path.join("."));
        expect(paths).toContain(field);
      }
    }
  });

  it("normalises email to lowercase", () => {
    const parsed = staffInputSchema.safeParse(
      validInput({ email: "Alex.Patel@Example.COM" }),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.email).toBe("alex.patel@example.com");
    }
  });

  it("rejects an invalid email", () => {
    const parsed = staffInputSchema.safeParse(
      validInput({ email: "not-an-email" }),
    );
    expect(parsed.success).toBe(false);
  });

  it("rejects a short phone number", () => {
    const parsed = staffInputSchema.safeParse(validInput({ phone: "1234" }));
    expect(parsed.success).toBe(false);
  });

  it("accepts an international phone number", () => {
    const parsed = staffInputSchema.safeParse(
      validInput({ phone: "+353 86 123 4567" }),
    );
    expect(parsed.success).toBe(true);
  });

  it("requires a start date when probation is applied without an end-date override", () => {
    const parsed = staffInputSchema.safeParse(
      validInput({
        applyProbation: true,
        probationStatus: "IN_PROGRESS",
      }),
    );
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const paths = parsed.error.issues.map((issue) => issue.path.join("."));
      expect(paths).toContain("startDate");
    }
  });

  it("requires clearance expiry for VALID and EXPIRED", () => {
    for (const status of ["VALID", "EXPIRED"] as const) {
      const parsed = staffInputSchema.safeParse(
        validInput({ securityClearanceStatus: status }),
      );
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        const paths = parsed.error.issues.map((issue) => issue.path.join("."));
        expect(paths).toContain("securityClearanceExpiryDate");
      }
    }
  });

  it("does not require clearance expiry for other statuses", () => {
    for (const status of ["NOT_RECORDED", "NOT_REQUIRED", "PENDING"] as const) {
      const parsed = staffInputSchema.safeParse(
        validInput({ securityClearanceStatus: status }),
      );
      expect(parsed.success).toBe(true);
    }
  });

  it("accepts VALID and EXPIRED when an expiry date is provided", () => {
    for (const status of ["VALID", "EXPIRED"] as const) {
      const parsed = staffInputSchema.safeParse(
        validInput({
          securityClearanceStatus: status,
          securityClearanceExpiryDate: "2026-12-31",
        }),
      );
      expect(parsed.success).toBe(true);
    }
  });

  it("parses form data including probation checkboxes", () => {
    const formData = new FormData();
    formData.set("staffIdNumber", "ST-2");
    formData.set("firstName", "Sam");
    formData.set("lastName", "Lee");
    formData.set("roleTitle", "Supervisor");
    formData.set("applyProbation", "on");
    formData.set("startDate", "2026-01-01");
    const parsed = parseStaffFormData(formData);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.applyProbation).toBe(true);
      expect(parsed.data.probationStatus).toBe("IN_PROGRESS");
      expect(parsed.data.employmentStatus).toBe("ACTIVE");
    }
  });
});
