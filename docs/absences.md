# Absence data model

Tenant-scoped unified absence records. Cancellation, AWOL, and Sickness attach to the same parent without changing tenant, staff, type, or audit relationships.

Logging an absence does **not** change staff employment status, event status, or staffing figures, and does not send email or SMS.

## Entities

### Absence
Shared parent for `CANCELLATION`, `AWOL`, and `SICKNESS`. Belongs to exactly one tenant. `tenantId`, `createdById`, and `updatedById` always come from the authenticated session, never the client.

Key fields: required same-tenant `staffId` (non-deleted for new writes), optional `eventId` (required for Cancellation and AWOL; **must be null for Sickness**), `reportedDate` (`DATE`, local calendar date stored as UTC midnight), optional `reportedTime` (`HH:mm`, Cancellation only), optional `reason` (required for Cancellation, `null` for AWOL and Sickness), optional `notes` (`null` for Sickness so Issue summary is not duplicated), optional `firstWorkingDaySick` (denormalised Sickness duplicate key; `null` for other types), `followUpType` / `followUpStatus`, `recordStatus` (`ACTIVE` | `ARCHIVED`).

A type-aware check constraint `Absence_event_required_by_type` requires an Event for Cancellation and AWOL and forbids one for Sickness.

Cancellation, AWOL, and Sickness writes set `followUpType = REVIEW` and `followUpStatus = PENDING` on the parent so the shared schema stays valid. Follow-up is **not** shown on AWOL or Sickness screens and is not a workflow in this release.

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

### SicknessDetail
One-to-one type-specific row for the Part 1 initial sickness report:

- `firstWorkingDaySick` — first booked working day or shift affected (not verified against a rota in Part 1)
- optional `sicknessStartedDate` — when the sickness itself began, on or before the first working day
- optional `issueSummary` — short operational summary, not a diagnosis. Outer whitespace trimmed, blank normalised to null, max 1,000 Unicode code points, inner line breaks preserved and rendered as escaped text
- `staffFirstNameSnapshot`, `staffLastNameSnapshot`, `staffIdNumberSnapshot` — historical Staff display for the Ledger and lists. Written server-side from trusted same-tenant Staff on create and Staff correction. Not used for authorisation, duplicate checks, or Staff mutations.

`Absence.firstWorkingDaySick` is a denormalised copy of the detail date used only for the race-safe active duplicate index. Writes copy both values in the same transaction.

Sickness is an operational absence record, not a medical record. Issue summary is never previewed in Staff history or general lists. Raw text is returned only on the authorised Sickness detail and correction paths, and in the tenant-scoped `AbsenceHistory` payload rendered on that detail page. The Sickness Ledger returns only an **Issue summary recorded** presence flag.

Advance-report acknowledgement is request-only. When a future first working day is saved, the create or correction audit event records `futureFirstWorkingDayConfirmed` with the confirmed date. It is not stored on `SicknessDetail`.

Part 1 does not add end date, certificates, follow-ups, letters, or return-to-work. An `ACTIVE` Sickness record is operationally discoverable; it does not mean the Staff member is currently sick.

### AbsenceHistory
Append-only. Actions: `CREATED`, `CORRECTED`, `ARCHIVED`. Stores actor, timestamp, optional reason, and JSON `{ field, previous, next }` changes. There is no edit/delete UI. Compact history is shown on the detail page. On AWOL detail, `reportedDate` is labelled **Date recorded**. On Sickness detail, history actions are labelled **Sickness report created/corrected/archived**.

Raw Issue summary old/new values belong only on the authorised Sickness detail. A public-feed helper redacts them to **Issue summary changed**.

### AbsenceIdempotencyKey
Used by AWOL create (`AWOL_CREATE`) and Sickness create (`SICKNESS_CREATE`). Unique on `(tenantId, actorId, operation, key)`. Stores a payload fingerprint and the resulting Absence id. Identical retries return the original record. The same key with a different payload is rejected and creates nothing. Rows expire after 24 hours; expired keys for that actor are deleted lazily on the next create.

## Tenant timezone

`Tenant.timezone` is a required IANA timezone. Existing and new tenants default to `Europe/London`. Missing or invalid values fail with an administrator-facing configuration error. There is no silent fallback to the browser, server, or database timezone.

- **AWOL** eligibility, Date recorded default, correction eligibility, and Ledger date bounds use `tenant.timezone`.
- **Sickness** reported date default, future-date rejection, and advance-report confirmation use `tenant.timezone` (Center Circle: `Europe/London`).
- **Cancellation** notice calculation remains `Europe/London` (`OPERATING_TIMEZONE`) so existing Cancellation behaviour is unchanged.

## AWOL date semantics

- **Event date** is snapshotted from the selected Event. The administrator does not type a second occurrence date.
- **Date recorded** is stored in `reportedDate` and labelled Date recorded in the AWOL UI. It defaults to the tenant-local current date, cannot be in the future, and cannot be earlier than the Event date.
- A past Event is eligible. A future Event is not.
- A same-day Event with a known start time is eligible only when tenant-local now is at or after that start. Overnight Events use the stored start date/time.
- A same-day Event with no start time requires `sameDayStartUnknownConfirmed`.
- Client previews are usability only. The server recalculates at save using trusted Event values and a controllable clock in tests.

## Sickness date semantics

- **Date sickness reported** is stored in `reportedDate`. It defaults to tenant-local today and cannot be in the future. It may be before, equal to, or after the first working day affected.
- **First day sick from work** has no default. It cannot be more than 31 calendar days after the reported date. A future first working day requires an advance-report confirmation checkbox.
- **Sickness started**, when present, cannot be in the future and cannot be after the first working day.
- There is no maximum historical age in Part 1.
- Client date widgets are usability only. The server revalidates with tenant-local today.

## Notice calculation

Operating timezone is `Europe/London`. Calendar dates use `parseLocalDate` / UTC midnight, same as Events and Staff.

- `noticeCalendarDays` = event date − reported date (date-only; negative values are kept).
- If both reported time and event start time exist, combine each with its calendar date in London, store signed `noticeMinutes`, and set `noticeBasis = EXACT_TIME`. Short notice is `noticeMinutes < 1440`.
- Otherwise `noticeBasis = CALENDAR_DATE`, `noticeMinutes` is null, and short notice is `noticeCalendarDays <= 0`.
- Retrospective confirmation is required only when the report is **after** event start (exact) or **after** event date (calendar). Same-day calendar reports are short notice, not retrospective.
- Overnight `endsNextDay` does not affect notice (notice is to event start).
- Client preview uses the same helper; the server always recalculates from the trusted Event and reported date/time. Never persist a browser-supplied notice value.

AWOL and Sickness do not calculate or display notice.

## Duplicate protection and idempotency

At most one **active** Cancellation **or** AWOL per tenant/staff/event. Sickness is excluded from that slot. Enforced by a SQL partial unique index:

`(tenantId, staffId, eventId) WHERE recordStatus = 'ACTIVE' AND eventId IS NOT NULL AND type IN ('CANCELLATION', 'AWOL')`

At most one **active** Sickness per tenant/staff/first working day. Enforced by:

`(tenantId, staffId, firstWorkingDaySick) WHERE recordStatus = 'ACTIVE' AND type = 'SICKNESS' AND firstWorkingDaySick IS NOT NULL`

Sickness does not conflict with Cancellation or AWOL solely because the Staff member is the same. The service pre-checks and maps Prisma `P2002` to a field error that links to the existing same-tenant record. Archiving frees the unique slot so a replacement can be logged.

AWOL and Sickness create also use an idempotency key so double-click, refresh, and retry return the original successful result.

AWOL and Sickness correct/archive lock the Absence row (`SELECT … FOR UPDATE`), assert `recordStatus = ACTIVE`, and require a matching `updatedAt` precondition. A stale writer is rejected and must reload. A no-change Sickness correction is rejected with no audit event.

## Tenant isolation

All queries and mutations use `tenantId` from `requireTenant()`. Cross-tenant Staff, Event, Venue, or Absence identifiers return the same not-found outcome as a missing id.

## Write path

Server actions in `src/app/(app)/absence/actions.ts` authenticate with `requireTenant()`, parse FormData with the shared Zod schema, and call `createCancellation` / `correctCancellation` / `archiveCancellation`, `createAwol` / `correctAwol` / `archiveAwol`, or `createSickness` / `correctSickness` / `archiveSickness`. Those functions load same-tenant live Staff (and Event where required), and write Absence + type detail + history in one transaction. A Sickness request that contains an Event ID or another type's fields is rejected, not silently corrected.

## Archive

Logical deletion: `recordStatus = ARCHIVED` plus `archivedAt` / `archivedById` / `archiveReason`. Archived records stay reachable by URL for audit. They are excluded from default staff Absence History and from the active Ledger. Hard deletion is not supported. Archiving a Sickness report does **not** record recovery or return to work.

Staff history has a **Show archived** control that includes authorised archived Sickness rows only. Archived Cancellation, AWOL and Sickness rows are discoverable from the Ledger when **Show archived** is enabled. They are excluded from the default active Ledger.

## Ledger

`/ledger` is a tenant-scoped read-only All absences list. It does not copy rows into a separate Ledger table, mutate records, or show payment / follow-up / recovery status. Viewing the Ledger does not create operational audit events. Correction and archive stay on type-specific detail pages.

Default view is All absences (`/ledger`, unknown `view` values fall back here). Focused views filter the same query: `view=cancellations`, `view=awol`, `view=sickness`. Active records only unless `includeArchived=1`.

Shared date projections (display and query only; they do not change source records):

- **Recorded** — Cancellation reported date, AWOL date recorded, Sickness date reported (`Absence.reportedDate`).
- **Affected date** — Cancellation/AWOL Event date snapshot, Sickness first day sick from work.

Default All absences order is Recorded descending, then Affected date, `createdAt`, then `id`. Allowed shared sorts are `type`, `staff`, `reported`, `affected`, `created`. Focused views also allow `notice` (Cancellations), `event` (Cancellations/AWOL), `sicknessStarted` (Sickness). `eventDate` and `firstDay` are aliases of `affected`. Sort fields are allow-listed server-side.

Search covers Staff name/ID (live Staff plus Sickness snapshots) and Event name/reference for Cancellation and AWOL. It never searches Cancellation reasons, AWOL notes, or Sickness Issue summary. Filters: Recorded From/To (`reportedFrom`/`reportedTo`), Affected From/To (`affectedFrom`/`affectedTo`; older `eventFrom`/`eventTo` and `firstDayFrom`/`firstDayTo` still parse), Venue and Event type for event-linked rows only. Event filters exclude Sickness because Sickness has no Event. Page size is 25.

The table uses shared columns (Type, Staff, Recorded, Affected date, Context, Status, View) plus a compact type-aware Context cell: Cancellation event/venue/notice, AWOL event/venue/reference, Sickness initial-report label, started date, and **Issue summary recorded** when present. Raw Issue summary, full notes, and full Cancellation reasons are never selected or returned. Staff display uses live Staff for Cancellation/AWOL and Sickness snapshots. Status is Active or Archived only.

Indexes (reviewed against the mixed query; no extra Ledger migration added):

- `Absence (tenantId, type, recordStatus, reportedDate)` — type list and Recorded range.
- `Absence (tenantId, type, recordStatus, firstWorkingDaySick)` — Sickness first-day range.
- `CancellationDetail (tenantId, eventDateSnapshot)` — Cancellation affected-date sort.
- `AwolDetail (tenantId, eventDateSnapshot)` — AWOL affected-date sort.
- `SicknessDetail (tenantId, firstWorkingDaySick)` — Staff history Sickness sort.
- `Absence (tenantId, staffId, firstWorkingDaySick)` — Sickness duplicate lookup.

## Routes

- `/ledger` — All absences Ledger (default)
- `/ledger?view=cancellations` — Cancellations
- `/ledger?view=awol` — AWOL
- `/ledger?view=sickness` — Sickness (`q`, `reportedFrom`, `reportedTo`, `affectedFrom`, `affectedTo`, `includeArchived=1`, `sort`, `direction`, `page`)
- `/absence/new` — log Cancellation, AWOL, or Sickness (`?staffId=` preselects Staff, `?type=awol` or `?type=sickness` opens that form)
- `/absence/[id]` — type-aware detail
- `/absence/[id]/edit` — type-aware correction
- Staff profile Absence History lists active Cancellation, AWOL, and Sickness rows (bounded, 10 per page), ordered by coalesced Event date snapshot or Sickness first working day, then reported date, then created at, then id. `?absenceArchived=1` includes archived Sickness.

## Future Sickness work

Sickness lifecycle work after the initial report and this unified Ledger is **paused** until the Ledger is accepted. Episode end date, duration, self-certification, fit notes, certificates, documents, follow-up, return to work, and reliability scoring are not approved delivery parts. Re-plan each slice against the combined Ledger, Centre Circle workflow, and privacy/retention decisions.

Later Sickness work should extend `SicknessDetail` or add related entities. Do not redesign tenant, staff, event, follow-up, record status, or history. After any Sickness row exists, rollback must not restore `eventId NOT NULL`, delete Sickness data, or invent Event IDs — disable new writes and use a reviewed forward fix.

### Migration verification

```sql
-- Preflight: every Cancellation/AWOL has an Event
SELECT COUNT(*) FROM "Absence"
WHERE "type" IN ('CANCELLATION', 'AWOL') AND "eventId" IS NULL;
-- Must be 0 before and after the Sickness migration.

-- Constraint and duplicate index
SELECT conname FROM pg_constraint WHERE conname = 'Absence_event_required_by_type';
SELECT indexname FROM pg_indexes
WHERE indexname = 'Absence_tenantId_staffId_firstWorkingDaySick_active_sickness_key';
```
