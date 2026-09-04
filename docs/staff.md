# Staff data model

Tenant-scoped operational staff records. This module is the record later features (absence logging, escalation, bulk import, certificates) attach to. Creating a staff member does **not** create a NoShowHQ login or send any communication.

## Entities

### Staff
Belongs to exactly one tenant. Soft-deleted with `deletedAt` / `deletedById`; deleted staff are excluded from lists, search, get/edit, and new manager selection.

Key fields: tenant-unique `staffIdNumber` (display value after trim), `staffIdNormalized` (lowercase uniqueness key among non-deleted rows in the tenant), `firstName`, `lastName`, optional `email` (stored lowercase; not a login) and `phone`, optional `department`, required `roleTitle`, optional `managerStaffId` (same-tenant staff), `employmentStatus` (`ACTIVE` | `MONITORING` | `CONTACT_REQUIRED` | `DISABLED` | `INACTIVE`), optional `startDate`, denormalised probation summary fields, `securityClearanceStatus` (summary only), clearance expiry (required when status is Valid or Expired; otherwise stored as empty), `notes`. The same Staff ID may exist in another tenant. Bulk import uses `staffInputSchema` then `createStaff`; it cannot skip mandatory fields, and a retry of the same live Staff ID is rejected rather than inserting a second row.

`tenantId`, `createdById`, and `updatedById` always come from the authenticated session, never from the client.

### Tenant probation default
`Tenant.defaultProbationDays` defaults to 90 for every new tenant. Tenant admins change it under **Settings → Probation**. `defaultProbationUpdatedAt` / `defaultProbationUpdatedById` record the latest change.

A changed default is snapshotted onto **new** probation cycles only. It never recalculates existing `StaffProbation` dates, review due dates, or status.

### StaffProbation (source of truth)
One operational cycle per start. At most one unresolved row per staff member (`completedAt IS NULL`, enforced by a partial unique index). Fields: `status` (`IN_PROGRESS` | `PASSED` | `EXTENDED` | `NOT_CONTINUED`), `effectiveDurationDays` (snapshot; nullable only for date-only legacy), `durationSource` (`TENANT_DEFAULT` | `INDIVIDUAL_OVERRIDE` | `MANUAL_END_DATE`), `startDate`, `currentEndDate`, `reviewDueDate` (end minus 28 calendar days), `completedAt` (Passed / Not continued only).

Staff summary columns are written from this record and must not be used as a second workflow. Pass / Extend / Not continued are recorded through `reviewStaffProbation`, not the staff form status field.

### StaffProbationHistory
Append-only. Retained when staff are later inactive or logically deleted. System-generated rows use `systemActor = true` and a null `actedById`. There is no edit/delete UI.

### StaffProbationTask
Persistent in-app reminders (`REVIEW_DUE`, `CHASE`, `OVERDUE_ESCALATION`). Unique on `(probationId, type, cadenceKey)` so reconcile retries are idempotent. Tasks are tenant-wide; any ADMIN can acknowledge or snooze. No email, SMS, or staff login.

## Date calculation

Calendar dates are stored as UTC midnight (`@db.Date`) via `parseLocalDate`. Arithmetic uses `addCalendarDays` (UTC date components). “Today” is `londonTodayIso()` (`Europe/London`). Do not persist a browser-local timestamp that can shift the displayed day.

- Duration-based end date = start + snapshotted duration.
- Review due = current end minus 28 calendar days (`PROBATION_REVIEW_LEAD_DAYS`).
- Derived lifecycle from London today: Upcoming (before review due), Review due (review due through end date), Overdue (after end, no completion), Passed, or Not continued. Those last two are distinct closed outcomes, not a shared green Completed badge. `EXTENDED` is an outcome on a still-active cycle; the current period still derives from the new dates.

An overdue probation stays visible until an administrator records a decision. It never silently becomes Passed, Disabled, Inactive, or Not continued, and never changes employment status.

After **Passed** or **Not continued**, an administrator can start a new cycle from the staff record. Confirming the dialog snapshots the current tenant default from London today. The previous cycle stays in history; it is not edited or deleted.

## Reminder cadence and idempotency

`expectedTaskSpecs` is the full reminder timeline. `currentTaskSpec` / `reconcileProbation` keep **one current actionable task** per unresolved cycle:

- Before the end date: `REVIEW_DUE` on the review due date, then the latest weekly `CHASE` (first chase = review due + 7). Each new chase cancels the prior unresolved reminder.
- After the end date: `OVERDUE_ESCALATION` (end date + 1 day) takes priority and stays the open queue item. Later overdue chase dates are still written to Probation History.
- Earlier reminders stay in history (including acknowledgements and snoozes). They are cancelled, not left as extra open queue items.
- The Staff nav count is unresolved people with a due reminder, not the number of historic chases.

Acknowledge records who/when and leaves the case in the queue. Snooze (reason required, max 7 calendar days) is forbidden once overdue. Extend closes the current task, keeps the extension in history, and schedules the next review from the new end date. Passed or Not continued closes the current task and removes the person from the queue.

`reconcileTenantProbationWork` runs on the app shell, staff list, staff detail, probation queue, `npm run reconcile-probation`, and `POST /api/cron/probation-reconcile` (`Authorization: Bearer $CRON_SECRET`, Vercel daily cron). Do not rely on a browser tab staying open.

## Legacy reconciliation

`reconcileLegacyProbations` copies existing staff summary dates onto `StaffProbation` without changing them and writes `LEGACY_RECONCILED` (system actor). Past-end-date unresolved records become Overdue and receive tasks. Missing start or end dates are not guessed; they appear under **Needs dates**. Rollback is restore-from-backup (Prisma migrate down is not used).

## Tenant isolation

All queries filter by `tenantId` from `requireTenant()`. Cross-tenant identifiers return the same not-found outcome as a missing or deleted id.

## Manager relation

Optional self-relation on `Staff`. The manager must belong to the same tenant, not be deleted, and (for a new selection) be `ACTIVE`. A staff member cannot be their own manager. Updates walk the manager chain and reject reporting cycles. Logical deletion does not clear `managerStaffId` on reports.

## Write path

Server actions in `src/app/(app)/staff/actions.ts` authenticate with `requireTenant()`, parse FormData with the shared Zod schema, and call `createStaff` / `updateStaff` / `deleteStaff` / `reviewStaffProbation` / `amendProbationEndDate` / `restartStaffProbation`. Do not create `User` rows as a side effect. Bulk import (`/staff/import`) reuses `createStaff`, `linkStaffManager`, and `staffInputSchema`, including `clearanceStatusRequiresExpiry` (Valid/Expired must include an expiry date). `createStaff` also rejects missing mandatory fields and duplicate live Staff IDs, so an import retry cannot insert a second record.

## Bulk import

Tenant admins download a blank `.xlsx` template (Staff, Instructions, Reference Data sheets) from `/staff/import`, upload an `.xlsx` or UTF-8 CSV with those headers, then review and confirm. Upload only parses and validates. Any blocking row error rejects the whole file. After preview, confirmation creates staff, in-file manager links, and probation cycles in one transaction via the same services as the single-staff form. It does not update existing staff, create logins, or send messages.

The raw spreadsheet is not stored. `StaffImport` / `StaffImportRow` keep a sanitised filename, SHA-256 hash, row JSON, manager/probation preview, created staff IDs, counts, and status. Tenant ID and actor always come from `requireTenant()`. Final confirmation is idempotent (`FOR UPDATE` + completed short-circuit). Temporary files never leave the request.
