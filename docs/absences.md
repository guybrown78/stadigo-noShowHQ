# Absence data model

Tenant-scoped unified absence records. Cancellation is the first exposed type. AWOL and Sickness will attach to the same parent without changing tenant, staff, type, or audit relationships.

Logging an absence does **not** change staff employment status, event status, or staffing figures, and does not send email or SMS.

## Entities

### Absence
Shared parent for `CANCELLATION`, `AWOL`, and `SICKNESS`. Belongs to exactly one tenant. `tenantId`, `createdById`, and `updatedById` always come from the authenticated session, never the client.

Key fields: required same-tenant `staffId` (non-deleted for new writes), optional `eventId` (required for Cancellation and later AWOL; Sickness may omit it), `reportedDate` (`DATE`, Europe/London calendar date stored as UTC midnight), optional `reportedTime` (`HH:mm`), `reason`, optional `notes`, `followUpType` / `followUpStatus`, `recordStatus` (`ACTIVE` | `ARCHIVED`).

Cancellation writes always set `followUpType = REVIEW` and `followUpStatus = PENDING` on the server. Follow-up status is separate from `recordStatus`. Resolving follow-up is a later Cancellation Ledger ticket.

NoShowHQ tracks attendance only. Follow-up never represents money, wages, or contact with staff, so avoid payment, charge, or payroll wording in this area.

### CancellationDetail
One-to-one type-specific row. Stores Event/Venue **snapshots** (name, date, start time, venue id/name) plus calculated notice (`noticeCalendarDays`, optional `noticeMinutes`, `noticeBasis`, `isShortNotice`). Future AWOL and Sickness types should add their own 1:1 tables rather than nullable columns on every Cancellation.

Keep the live Event foreign key and the snapshots. The link is for navigation and reporting. Snapshots preserve what the administrator saw if the Event is later edited or logically deleted.

### AbsenceHistory
Append-only. Actions: `CREATED`, `CORRECTED`, `ARCHIVED`. Stores actor, timestamp, optional reason, and JSON `{ field, previous, next }` changes. There is no edit/delete UI. Compact history is shown on the Cancellation detail page.

## Notice calculation

Operating timezone is `Europe/London`. Calendar dates use `parseLocalDate` / UTC midnight, same as Events and Staff.

- `noticeCalendarDays` = event date − reported date (date-only; negative values are kept).
- If both reported time and event start time exist, combine each with its calendar date in London, store signed `noticeMinutes`, and set `noticeBasis = EXACT_TIME`. Short notice is `noticeMinutes < 1440`.
- Otherwise `noticeBasis = CALENDAR_DATE`, `noticeMinutes` is null, and short notice is `noticeCalendarDays <= 0`.
- Retrospective confirmation is required only when the report is **after** event start (exact) or **after** event date (calendar). Same-day calendar reports are short notice, not retrospective.
- Overnight `endsNextDay` does not affect notice (notice is to event start).
- Client preview uses the same helper; the server always recalculates from the trusted Event and reported date/time. Never persist a browser-supplied notice value.

## Duplicate protection and idempotency

At most one **active** Cancellation per tenant/staff/event. Enforced by a SQL partial unique index:

`(tenantId, staffId, eventId, type) WHERE recordStatus = 'ACTIVE' AND eventId IS NOT NULL`

The service also pre-checks and maps Prisma `P2002` to a field error that links to the existing record. Double-clicks and retries cannot insert a second active row. Archiving frees the unique slot so a replacement Cancellation can be logged.

## Tenant isolation

All queries and mutations use `tenantId` from `requireTenant()`. Cross-tenant Staff, Event, Venue, or Absence identifiers return the same not-found outcome as a missing id.

## Write path

Server actions in `src/app/(app)/absence/actions.ts` authenticate with `requireTenant()`, parse FormData with the shared Zod schema, and call `createCancellation` / `correctCancellation` / `archiveCancellation`. Those functions load same-tenant live Staff and Event rows, calculate notice, snapshot Event/Venue, and write Absence + CancellationDetail + history in one transaction.

This ticket only accepts `type = CANCELLATION`. Do not add fake AWOL or Sickness forms.

## Archive

Logical deletion: `recordStatus = ARCHIVED` plus `archivedAt` / `archivedById` / `archiveReason`. Archived records stay reachable by URL for audit. They are excluded from staff Absence History and from the active Ledger. Hard deletion is not supported.

## Ledger

`/ledger` is a tenant-scoped read-only list of **active** `CANCELLATION` records. It reads the unified Absence parent and Cancellation snapshots. It does not copy rows into a separate Ledger table, mutate records, or show payment / follow-up status.

Default order is newest reported date, then reported time (`NULL` last), then `createdAt`, then `id`. Search covers Staff name/ID and Event snapshot name plus live Event reference. Filters are Venue (snapshot id), Event type (live Event), and inclusive reported-date bounds. Page size is 25.

Indexes added for this view:

- `Absence (tenantId, type, recordStatus, reportedDate)` — replaced the previous 3-column type/status index so the default list and date range can use one left-prefix index.
- `CancellationDetail (tenantId, eventDateSnapshot)` — Event-date sort.

AWOL and Sickness views are visible as Coming soon only.

## Routes

- `/ledger` — active Cancellation Ledger
- `/absence/new` — log a Cancellation (`?staffId=` preselects same-tenant Staff)
- `/absence/[id]` — Cancellation detail
- `/absence/[id]/edit` — correction
- Staff profile Absence History lists active rows from this model (bounded, 10 per page). The profile header has a generic Log absence action.

## Future types

Add `AbsenceAwolDetail` / `AbsenceSicknessDetail` (or equivalent) and allow those `type` values on create. Do not redesign tenant, staff, event, follow-up, record status, or history.
