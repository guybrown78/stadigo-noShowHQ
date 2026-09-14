# Absence data model

Tenant-scoped unified absence records. Cancellation and AWOL are the working types. Sickness will attach to the same parent without changing tenant, staff, type, or audit relationships.

Logging an absence does **not** change staff employment status, event status, or staffing figures, and does not send email or SMS.

## Entities

### Absence
Shared parent for `CANCELLATION`, `AWOL`, and `SICKNESS`. Belongs to exactly one tenant. `tenantId`, `createdById`, and `updatedById` always come from the authenticated session, never the client.

Key fields: required same-tenant `staffId` (non-deleted for new writes), optional `eventId` (required for Cancellation and AWOL; Sickness may omit it), `reportedDate` (`DATE`, local calendar date stored as UTC midnight), optional `reportedTime` (`HH:mm`, Cancellation only), optional `reason` (required for Cancellation, `null` for AWOL), optional `notes`, `followUpType` / `followUpStatus`, `recordStatus` (`ACTIVE` | `ARCHIVED`).

Cancellation and AWOL writes set `followUpType = REVIEW` and `followUpStatus = PENDING` on the parent so the shared schema stays valid. Follow-up is **not** shown on AWOL screens and is not a workflow in this release.

NoShowHQ tracks attendance only. Follow-up never represents money, wages, or contact with staff, so avoid payment, charge, or payroll wording in this area.

### CancellationDetail
One-to-one type-specific row. Stores Event/Venue **snapshots** (name, date, start time, venue id/name) plus calculated notice (`noticeCalendarDays`, optional `noticeMinutes`, `noticeBasis`, `isShortNotice`).

Keep the live Event foreign key and the snapshots. The link is for navigation and reporting. Snapshots preserve what the administrator saw if the Event is later edited or logically deleted.

### AwolDetail
One-to-one type-specific row for AWOL. Stores Event/Venue snapshots used as operational evidence:

- `eventNameSnapshot`, optional `eventReferenceSnapshot`
- `eventDateSnapshot` (the missed attendance date)
- optional start/end time snapshots
- optional venue id/name snapshots
- optional `eventTypeSnapshot` / `eventSubtypeSnapshot` (missing type displays as Unspecified; never inferred later from the live Event)
- `sameDayStartUnknownConfirmed` — `true` only when the Event date is the tenant-local current date, the Event has no start time, and the administrator confirmed non-attendance

Do not copy Internal notes into `Absence.reason`. AWOL has no notice, payment, follow-up, impact, or shift columns.

### AbsenceHistory
Append-only. Actions: `CREATED`, `CORRECTED`, `ARCHIVED`. Stores actor, timestamp, optional reason, and JSON `{ field, previous, next }` changes. There is no edit/delete UI. Compact history is shown on the detail page. On AWOL detail, `reportedDate` is labelled **Date recorded**.

### AbsenceIdempotencyKey
Used by AWOL create. Unique on `(tenantId, actorId, operation, key)` for `AWOL_CREATE`. Stores a payload fingerprint and the resulting Absence id. Identical retries return the original record. The same key with a different payload is rejected and creates nothing. Rows expire after 24 hours; expired keys for that actor are deleted lazily on the next create. A rollback of the AWOL migration must drop this table and `AwolDetail` but must **not** hard-delete `Absence` rows of type AWOL.

## Tenant timezone

`Tenant.timezone` is a required IANA timezone. Existing and new tenants default to `Europe/London`. Missing or invalid values fail with an administrator-facing configuration error. There is no silent fallback to the browser, server, or database timezone.

- **AWOL** eligibility, Date recorded default, correction eligibility, and Ledger date bounds use `tenant.timezone`.
- **Cancellation** notice calculation remains `Europe/London` (`OPERATING_TIMEZONE`) so existing Cancellation behaviour is unchanged.

## AWOL date semantics

- **Event date** is snapshotted from the selected Event. The administrator does not type a second occurrence date.
- **Date recorded** is stored in `reportedDate` and labelled Date recorded in the AWOL UI. It defaults to the tenant-local current date, cannot be in the future, and cannot be earlier than the Event date.
- A past Event is eligible. A future Event is not.
- A same-day Event with a known start time is eligible only when tenant-local now is at or after that start. Overnight Events use the stored start date/time.
- A same-day Event with no start time requires `sameDayStartUnknownConfirmed`.
- Client previews are usability only. The server recalculates at save using trusted Event values and a controllable clock in tests.

## Notice calculation

Operating timezone is `Europe/London`. Calendar dates use `parseLocalDate` / UTC midnight, same as Events and Staff.

- `noticeCalendarDays` = event date − reported date (date-only; negative values are kept).
- If both reported time and event start time exist, combine each with its calendar date in London, store signed `noticeMinutes`, and set `noticeBasis = EXACT_TIME`. Short notice is `noticeMinutes < 1440`.
- Otherwise `noticeBasis = CALENDAR_DATE`, `noticeMinutes` is null, and short notice is `noticeCalendarDays <= 0`.
- Retrospective confirmation is required only when the report is **after** event start (exact) or **after** event date (calendar). Same-day calendar reports are short notice, not retrospective.
- Overnight `endsNextDay` does not affect notice (notice is to event start).
- Client preview uses the same helper; the server always recalculates from the trusted Event and reported date/time. Never persist a browser-supplied notice value.

AWOL does not calculate or display notice.

## Duplicate protection and idempotency

At most one **active** Cancellation **or** AWOL per tenant/staff/event. Sickness is excluded. Enforced by a SQL partial unique index:

`(tenantId, staffId, eventId) WHERE recordStatus = 'ACTIVE' AND eventId IS NOT NULL AND type IN ('CANCELLATION', 'AWOL')`

The service pre-checks both types on Cancellation and AWOL create/correct paths and maps Prisma `P2002` to a field error that links to the existing same-tenant record. Archiving frees the unique slot so a replacement can be logged. The administrator must archive or correct the existing record; the system never converts Cancellation into AWOL or the reverse.

AWOL create also uses an idempotency key so double-click, refresh, and retry return the original successful result.

AWOL correct/archive lock the Absence row (`SELECT … FOR UPDATE`), assert `recordStatus = ACTIVE`, and require a matching `updatedAt` precondition. A stale writer is rejected and must reload.

## Tenant isolation

All queries and mutations use `tenantId` from `requireTenant()`. Cross-tenant Staff, Event, Venue, or Absence identifiers return the same not-found outcome as a missing id.

## Write path

Server actions in `src/app/(app)/absence/actions.ts` authenticate with `requireTenant()`, parse FormData with the shared Zod schema, and call `createCancellation` / `correctCancellation` / `archiveCancellation` or `createAwol` / `correctAwol` / `archiveAwol`. Those functions load same-tenant live Staff and Event rows, snapshot Event/Venue, and write Absence + type detail + history in one transaction.

## Archive

Logical deletion: `recordStatus = ARCHIVED` plus `archivedAt` / `archivedById` / `archiveReason`. Archived records stay reachable by URL for audit. They are excluded from staff Absence History and from the active Ledger. Hard deletion is not supported.

## Ledger

`/ledger` is a tenant-scoped read-only list. `view=cancellations` (default) lists active Cancellations. `view=awol` lists active AWOLs. Sickness remains Coming soon. It does not copy rows into a separate Ledger table, mutate records, or show payment / follow-up status.

Cancellation default order is newest reported date, then reported time (`NULL` last), then `createdAt`, then `id`. Search covers Staff name/ID and Event snapshot name plus live Event reference. Filters are Venue (snapshot id), Event type (live Event), and inclusive reported-date bounds. Page size is 25.

AWOL default order is Event date descending, then Date recorded, `createdAt`, then `id`. Search covers Staff name/ID and Event name/reference **snapshots**. Venue and Event Type filters are built from distinct AWOL snapshots. Event Date and Date recorded ranges are inclusive local dates. Notes are previewed, never searched.

Indexes:

- `Absence (tenantId, type, recordStatus, reportedDate)` — type list and Date recorded range.
- `CancellationDetail (tenantId, eventDateSnapshot)` — Cancellation Event-date sort.
- `AwolDetail (tenantId, eventDateSnapshot)` — AWOL Event-date sort.

## Routes

- `/ledger` — Cancellation Ledger
- `/ledger?view=awol` — AWOL Ledger
- `/absence/new` — log Cancellation or AWOL (`?staffId=` preselects Staff, `?type=awol` opens AWOL)
- `/absence/[id]` — type-aware detail
- `/absence/[id]/edit` — type-aware correction
- Staff profile Absence History lists active Cancellation and AWOL rows (bounded, 10 per page), ordered by coalesced Event date snapshot, then Date recorded, then created at.

## Future types

Add `AbsenceSicknessDetail` (or equivalent) and allow `SICKNESS` on create. Do not redesign tenant, staff, event, follow-up, record status, or history. AWOL contact/follow-up, pay periods, and reliability scoring remain out of scope.
