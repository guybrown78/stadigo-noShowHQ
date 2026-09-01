import type {
  EmploymentStatus,
  ProbationDurationSource,
  SecurityClearanceStatus,
} from "@prisma/client";
import type { StaffImportHeader } from "@/lib/staff/import/constants";

export type ImportRowRaw = Record<StaffImportHeader, string>;

export type ImportRowNormalized = {
  staffIdNumber: string;
  staffIdNormalized: string;
  firstName: string;
  lastName: string;
  roleTitle: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  managerStaffIdNumber: string | null;
  employmentStatus: EmploymentStatus;
  startDate: string | null;
  applyProbation: boolean;
  probationLengthDays: number | null;
  overrideProbationEndDate: boolean;
  probationEndDate: string | null;
  securityClearanceStatus: SecurityClearanceStatus;
  securityClearanceExpiryDate: string | null;
  notes: string | null;
};

export type ManagerOutcome =
  | { kind: "none" }
  | {
      kind: "existing";
      managerStaffId: string;
      staffIdNumber: string;
      name: string;
    }
  | {
      kind: "import";
      sourceRowNumber: number;
      staffIdNumber: string;
      name: string;
    };

export type ProbationPreview = {
  applyProbation: boolean;
  durationSource: ProbationDurationSource | null;
  effectiveDurationDays: number | null;
  startDate: string | null;
  endDate: string | null;
  reviewDueDate: string | null;
  manualEndDate: boolean;
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
  managerOutcome: ManagerOutcome | null;
  probationPreview: ProbationPreview | null;
};

export type ExistingStaffForImport = {
  id: string;
  staffIdNumber: string;
  staffIdNormalized: string;
  firstName: string;
  lastName: string;
  employmentStatus: EmploymentStatus;
};
