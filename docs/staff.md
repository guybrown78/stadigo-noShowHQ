# Staff data model

Tenant-scoped operational staff records. This module is the record later features (absence logging, escalation, probation reminders, bulk import, certificates) will attach to. Creating a staff member does **not** create a NoShowHQ login or send any communication.

## Entities

### Staff
Belongs to exactly one tenant. Soft-deleted with `deletedAt` / `deletedById`; deleted staff are excluded from lists, search, get/edit, and new manager selection.

Key fields: tenant-unique `staffIdNumber` (display value after trim), `staffIdNormalized` (lowercase uniqueness key), `firstName`, `lastName`, optional `email` (stored lowercase; not a login) and `phone`, optional `department`, required `roleTitle`, optional `managerStaffId` (same-tenant staff), `employmentStatus` (`ACTIVE` | `MONITORING` | `CONTACT_REQUIRED` | `DISABLED` | `INACTIVE`), optional `startDate`, probation fields, `securityClearanceStatus` (summary only), optional clearance expiry, `notes`.

`tenantId`, `createdById`, and `updatedById` always come from the authenticated session, never from the client.

### Tenant probation default
`Tenant.defaultProbationDays` defaults to 90. There is no settings screen in this ticket. The staff form shows this default when probation is applied and allows a per-staff duration override.

### StaffProbationHistory
Append-only. Written for meaningful probation decisions: `STARTED`, `END_DATE_OVERRIDDEN`, `EXTENDED`, `PASSED`, `STATUS_CHANGED`. Shown as a simple read-only list on the staff detail page.

## Staff ID normalisation

Trim surrounding whitespace and collapse internal runs of space for display (`staffIdNumber`). Uniqueness is case-insensitive via `staffIdNormalized`. Different tenants may reuse the same staff ID. After logical deletion, the same tenant may reuse that ID. The database enforces this with a partial unique index on `(tenantId, staffIdNormalized) WHERE deletedAt IS NULL`.

## Tenant isolation

All queries filter by `tenantId` from `requireTenant()`. Cross-tenant identifiers return the same not-found outcome as a missing or deleted id. Manager IDs are re-checked against the current tenant; another tenant’s staff id is rejected even if it exists.

## Manager relation

Optional self-relation on `Staff`. The manager must belong to the same tenant, not be deleted, and (for a new selection) be `ACTIVE`. A staff member cannot be their own manager. Updates walk the manager chain and reject reporting cycles. Logical deletion does not clear `managerStaffId` on reports, so historical links remain.

## Probation calculation

- Apply-probation is a form control, not a stored column. Off stores `NOT_APPLICABLE` and clears dates.
- Effective duration is the per-staff `probationLengthDays` override when supplied, otherwise `Tenant.defaultProbationDays`.
- If a start date is present and the end date is not deliberately overridden, end date = start date + effective duration (calendar days, UTC date storage).
- A checked “Set a different probation end date” stores `probationEndDateOverridden` and the supplied date (must not precede start date).
- Review due date = current probation end date minus 28 calendar days, except `PASSED` which clears it.
- `EXTENDED` requires a future end date.
- `createStaff` / `updateStaff` in `src/lib/staff/service.ts` are the write path a later bulk import should reuse.

## Write path

Server actions in `src/app/(app)/staff/actions.ts` authenticate with `requireTenant()`, parse FormData with the shared Zod schema, and call `createStaff` / `updateStaff` / `deleteStaff`. Do not create `User` rows as a side effect.
